import { getPrismaClient } from '../db.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { encodeMessage } from '../messaging/codec.js';
import { getProducer } from '../messaging/kafka.js';
import type { MarketEvent } from '@tradeit/shared';
import { outboxPendingGauge, outboxPublishDuration } from '../metrics/registry.js';

const prisma = getPrismaClient();

export async function enqueueEvents(events: MarketEvent[]) {
  if (events.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const evt of events) {
      await (tx as any).eventOutbox.create({
        data: {
          eventType: evt.type,
          payload: evt as any,
          orderSymbol: (evt as any).payload?.order?.symbol ?? (evt as any).payload?.trade?.symbol ?? undefined,
          orderSequence: (evt as any).orderSequence ? BigInt((evt as any).orderSequence) : undefined,
        },
      });
    }
  });
}

export async function publishOutboxBatch(limit = 100) {
  const pending: any[] = await (prisma as any).eventOutbox.findMany({
    where: { publishedAt: null },
    orderBy: { producedAt: 'asc' },
    take: limit,
  });
  if (pending.length === 0) return 0;

  const producer = await getProducer();
  const endTimer = outboxPublishDuration.startTimer();
  const messages = pending.map((row) => ({ key: row.eventType, value: encodeMessage(row.payload) }));
  await producer.send({ topic: config.kafkaMarketTopic, messages });

  const ids = pending.map((p) => p.id);
  await prisma.$transaction(async (tx) => {
    await (tx as any).eventOutbox.updateMany({
      where: { id: { in: ids } },
      data: { publishedAt: new Date(), attempts: { increment: 1 } },
    });
  });
  endTimer();
  return pending.length;
}

let publishing = false;
export function startOutboxPublisher(intervalMs = 500) {
  if (publishing) return () => {};
  publishing = true;
  const timer = setInterval(async () => {
    try {
      const pendingCount = await (prisma as any).eventOutbox.count({ where: { publishedAt: null } });
      outboxPendingGauge.set(pendingCount);
      const count = await publishOutboxBatch();
      if (count > 0) logger.debug({ count }, 'Published outbox events');
    } catch (e) {
      logger.error({ err: e }, 'Outbox publish failure');
    }
  }, intervalMs);
  return () => {
    clearInterval(timer);
    publishing = false;
  };
}
