import { randomUUID } from "node:crypto";

import type { OrderCommand, MarketEvent } from "@tradeit/shared";
import type { EachMessagePayload } from "kafkajs";

import { config } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { logger } from "./logger.js";
import { initializeMatchingEngine, engine, launchSyntheticFeed, type IncomingOrder } from "./matching/index.js";
import { encodeMessage, decodeMessage } from "./messaging/codec.js";
import { createConsumer, disconnectKafka, getProducer } from "./messaging/kafka.js";
import { connectRedis, disconnectRedis, getRedisClient } from "./services/cache.js";
import { persistProcessedOrder } from "./services/orderPersistence.js";

const BOOK_CACHE_TTL_SECONDS = 5;

type SubmitContext = {
  commandId?: string;
  source?: string;
};

const publishEvents = async (events: MarketEvent[]) => {
  if (events.length === 0) {
    return;
  }

  const producer = await getProducer();
  const messages = events.map((event) => ({
    key: event.type,
    value: encodeMessage(event),
  }));
  await producer.send({
    topic: config.kafkaMarketTopic,
    messages,
  });
};

const updateCacheFromEvents = async (events: MarketEvent[]) => {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  for (const event of events) {
    if (event.type === "book:snapshot") {
      const snapshot = event.payload.snapshot;
      await redis.set(`book:${snapshot.symbol}`, JSON.stringify(snapshot), "EX", BOOK_CACHE_TTL_SECONDS);
    }
  }
};

const toIncomingOrder = (command: OrderCommand): IncomingOrder => ({
  userId: command.userId,
  symbol: command.symbol,
  side: command.side,
  type: command.type,
  quantity: command.quantity,
  price: command.price,
});

const processOrder = async (incomingOrder: IncomingOrder, context: SubmitContext = {}) => {
  const capturedEvents: MarketEvent[] = [];
  const unsubscribe = engine.subscribe((event) => {
    capturedEvents.push(event);
  });

  try {
    const result = engine.placeOrder(incomingOrder);

    if (result.status === "accepted") {
      await persistProcessedOrder(result);
    }

    await updateCacheFromEvents(capturedEvents);
    await publishEvents(capturedEvents);

    if (result.status === "rejected") {
      logger.warn({ order: incomingOrder, context }, "Order rejected by matching engine");
    }
  } catch (error) {
    logger.error({ error, order: incomingOrder, context }, "Failed to process order command");
    throw error;
  } finally {
    unsubscribe();
  }
};

const startConsumer = async () => {
  const consumer = await createConsumer("tradeit-matcher");
  await consumer.subscribe({ topic: config.kafkaOrderTopic });
  await consumer.run({
    eachMessage: async ({ message }: EachMessagePayload) => {
      if (!message.value) {
        return;
      }

      try {
        const command = decodeMessage<OrderCommand>(message.value as Buffer);
        await processOrder(toIncomingOrder(command), {
          commandId: command.commandId,
          source: command.source,
        });
      } catch (error) {
        logger.error({ error }, "Failed to handle order command message");
      }
    },
  });
  logger.info({ topic: config.kafkaOrderTopic }, "Matcher consumer running");

  return consumer;
};

const bootstrap = async () => {
  logger.info({ service: config.serviceName }, "Starting matcher worker");
  await connectDatabase();
  await connectRedis();
  await initializeMatchingEngine();

  const consumer = await startConsumer();
  const stopSynthetic = await launchSyntheticFeed(async (order) => {
    await processOrder(order, { commandId: randomUUID(), source: "synthetic" });
  });

  const shutdown = async () => {
    logger.info("Shutting down matcher worker");
    await Promise.allSettled([
      consumer.disconnect(),
      disconnectKafka(),
      stopSynthetic(),
      disconnectRedis(),
      disconnectDatabase(),
    ]);
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

void bootstrap().catch((error) => {
  logger.error({ error }, "Matcher worker failed to start");
  void Promise.allSettled([disconnectKafka(), disconnectRedis(), disconnectDatabase()]).finally(() => {
    process.exit(1);
  });
});
