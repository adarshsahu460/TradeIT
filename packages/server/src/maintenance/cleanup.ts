import { config } from '../config.js';
import { getPrismaClient } from '../db.js';
import { logger } from '../logger.js';
import { outboxPendingGauge } from '../metrics/registry.js';

const prisma = getPrismaClient();

let running = false;
let timer: NodeJS.Timeout | null = null;

export function startCleanupLoop() {
  if (running) return () => {};
  running = true;
  const interval = Math.max(60_000, config.cleanupIntervalMs); // enforce min 1m
  const execute = async () => {
    const start = Date.now();
    const cutoffOutbox = new Date(Date.now() - config.outboxRetentionHours * 3600_000);
    const cutoffIdem = new Date(Date.now() - config.idempotencyRetentionHours * 3600_000);
    try {
      const [deletedOutbox, deletedIdem] = await prisma.$transaction([
        (prisma as any).eventOutbox.deleteMany({ where: { publishedAt: { not: null }, producedAt: { lt: cutoffOutbox } } }),
        (prisma as any).idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoffIdem } } }),
      ]);
      const pending = await (prisma as any).eventOutbox.count({ where: { publishedAt: null } });
      outboxPendingGauge.set(pending);
      logger.info({ deletedOutbox: deletedOutbox.count, deletedIdempotency: deletedIdem.count, durationMs: Date.now() - start }, 'cleanup_completed');
    } catch (e) {
      logger.warn({ err: e }, 'cleanup_failed');
    }
  };
  // initial delay short to not block startup
  timer = setInterval(execute, interval);
  setTimeout(execute, 10_000);
  return () => {
    if (timer) clearInterval(timer);
    running = false;
  };
}
