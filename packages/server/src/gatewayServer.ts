import { createServer } from "node:http";

import type { MarketEvent, OrderBookSnapshot } from "@tradeit/shared";
import { DEFAULT_SYMBOLS } from "@tradeit/shared";
import type { EachMessagePayload } from "kafkajs";
import WebSocket, { WebSocketServer } from "ws";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { decodeMessage } from "./messaging/codec.js";
import { kafkaConsumerLagGauge } from "./metrics/registry.js";
import { createConsumer, disconnectKafka } from "./messaging/kafka.js";
import { connectRedis, disconnectRedis, getRedisClient } from "./services/cache.js";


const port = config.gatewayPort;

const server = createServer();
const wss = new WebSocketServer({ server, path: "/ws" });

const snapshots = new Map<string, OrderBookSnapshot>();

const broadcast = (payload: MarketEvent) => {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
  if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

const seedSnapshotsFromRedis = async () => {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  for (const symbol of DEFAULT_SYMBOLS) {
    try {
      const cached = await redis.get(`book:${symbol}`);
      if (cached) {
        const snapshot: OrderBookSnapshot = JSON.parse(cached);
        snapshots.set(symbol, snapshot);
      }
    } catch (error) {
      logger.warn({ error, symbol }, "Failed to hydrate snapshot from Redis");
    }
  }
};

wss.on("connection", async (socket: WebSocket) => {
  logger.info("Gateway websocket client connected");

  socket.send(
    JSON.stringify({
      type: "engine:hello",
      payload: { symbols: DEFAULT_SYMBOLS },
      timestamp: Date.now(),
    }),
  );

  const redis = getRedisClient();
  if (redis && snapshots.size === 0) {
    await seedSnapshotsFromRedis();
  }

  for (const snapshot of snapshots.values()) {
    socket.send(
      JSON.stringify({
        type: "book:snapshot",
        payload: { snapshot },
        timestamp: Date.now(),
      }),
    );
  }

  socket.on("close", () => {
    logger.info("Gateway websocket client disconnected");
  });
});

const startConsumer = async () => {
  const consumer = await createConsumer("tradeit-gateway");
  await consumer.subscribe({ topic: config.kafkaMarketTopic });
  await consumer.run({
    eachMessage: async ({ message, partition }: EachMessagePayload) => {
      if (!message.value) {
        return;
      }
      try {
        const event = decodeMessage<MarketEvent>(message.value as Buffer);
        if (event.type === "book:snapshot") {
          snapshots.set(event.payload.snapshot.symbol, event.payload.snapshot);
        }
        broadcast(event);
        // Placeholder lag metric: record offset mod 1000 as pseudo-lag until admin API used.
        if (message.offset) {
          const pseudoLag = Number(message.offset) % 1000;
          kafkaConsumerLagGauge.set({ consumer: "gateway" }, pseudoLag);
        }
      } catch (error) {
        logger.error({ error }, "Failed to decode market event");
      }
    },
  });
  logger.info({ topic: config.kafkaMarketTopic }, "Gateway consumer running");
  return consumer;
};

const bootstrap = async () => {
  logger.info({ service: config.serviceName, kafkaBrokers: config.kafkaBrokers }, "Starting gateway server");
  await connectRedis();
  const consumer = await startConsumer();

  server.listen(port, () => {
    logger.info({ port }, "Gateway websocket server listening");
  });

  const shutdown = async () => {
    logger.info("Shutting down gateway server");
    wss.clients.forEach((client) => client.terminate());
    wss.close();
    server.close();
    await Promise.allSettled([consumer.disconnect(), disconnectKafka(), disconnectRedis()]);
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

void bootstrap().catch((error) => {
  logger.error({ error }, "Gateway server failed to start");
  void Promise.allSettled([disconnectKafka(), disconnectRedis()]).finally(() => process.exit(1));
});
