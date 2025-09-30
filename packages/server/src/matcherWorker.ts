import { randomUUID } from "node:crypto";

import type { OrderCommand, MarketEvent } from "@tradeit/shared";
import type { EachMessagePayload } from "kafkajs";

import { config } from "./config.js";
import { connectDatabase, disconnectDatabase } from "./db.js";
import { logger } from "./logger.js";
import { initializeMatchingEngine, engine, launchSyntheticFeed, type IncomingOrder } from "./matching/index.js";
import { encodeMessage, decodeMessage } from "./messaging/codec.js";
import { createConsumer, disconnectKafka, getProducer } from "./messaging/kafka.js";
import { enqueueEvents, startOutboxPublisher } from "./outbox/outboxService.js";
import { startCleanupLoop } from "./maintenance/cleanup.js";
import { connectRedis, disconnectRedis, getRedisClient } from "./services/cache.js";
import { persistProcessedOrder } from "./services/orderPersistence.js";
import { orderProcessingDuration } from "./metrics/registry.js";

const BOOK_CACHE_TTL_SECONDS = 5;

type SubmitContext = {
  commandId?: string;
  source?: string;
};

// Immediate publish path is replaced by outbox pattern. We retain a direct publish fallback env hook later if needed.
const publishEvents = async (_events: MarketEvent[]) => { /* no-op: handled by outbox */ };

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
  // We capture events, but we want sequence assigned before publishing the order:accepted event.
  // So we run engine, persist (which mutates order.sequence), then publish events (with updated order object).
  const capturedEvents: MarketEvent[] = [];
  const unsubscribe = engine.subscribe((event) => capturedEvents.push(event));
  try {
    const start = process.hrtime.bigint();
    const result = engine.placeOrder(incomingOrder);
    if (result.status === "accepted") {
      await persistProcessedOrder(result); // assigns order.sequence
    }
  await updateCacheFromEvents(capturedEvents);
  await enqueueEvents(capturedEvents);
    const end = process.hrtime.bigint();
    const seconds = Number(end - start) / 1e9;
    orderProcessingDuration.observe({ symbol: incomingOrder.symbol, result: result.status }, seconds);
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
  logger.info({ service: config.serviceName, kafkaBrokers: config.kafkaBrokers }, "Starting matcher worker");
  await connectDatabase();
  await connectRedis();
  await initializeMatchingEngine();

  const consumer = await startConsumer();
  const stopOutbox = startOutboxPublisher(500);
  const stopCleanup = startCleanupLoop();
  const stopSynthetic = await launchSyntheticFeed(async (order) => {
    await processOrder(order, { commandId: randomUUID(), source: "synthetic" });
  });

  const shutdown = async () => {
    logger.info("Shutting down matcher worker");
    await Promise.allSettled([
  consumer.disconnect(),
  stopOutbox(),
  stopCleanup(),
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
