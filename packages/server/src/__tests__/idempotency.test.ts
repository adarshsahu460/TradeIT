import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { app } from '../app.js';
import { getPrismaClient } from '../db.js';
import { config } from '../config.js';
import { createTestUserAndLogin, submitOrder } from '../test-helpers/testUtils.js';

// NOTE: These tests assume a test database (NODE_ENV=test) with migrations applied.
// They focus on HTTP semantics of idempotent order submission.

let prisma: ReturnType<typeof getPrismaClient>;
let testUser: Awaited<ReturnType<typeof createTestUserAndLogin>>;

// These exercise end-to-end HTTP semantics + DB persistence for idempotency handling.
// They intentionally do not mock Kafka; if Kafka is unavailable the test will still pass
// as long as the order endpoint returns 202 (enqueued). If infra is unavailable it should
// fail loudly rather than silently skipping.

describe('Idempotent Orders', () => {
  beforeAll(async () => {
    (config as any).isTestEnvironment = true;
    (config as any).redisUrl = undefined;
    prisma = getPrismaClient();
    testUser = await createTestUserAndLogin(app, {});
  });

  beforeEach(() => {
    // For tests we disable synthetic trades to reduce noise
    (config as any).enableSyntheticTrades = false;
  });

  it('returns same commandId for duplicate idempotent order', async () => {
    const key = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body = { symbol: 'BTCUSD', side: 'buy', type: 'limit', quantity: 1, price: 10000 };
    const first = await submitOrder(app, testUser.token, body, { 'X-Idempotency-Key': key });
    expect(first.status).toBe(202);
    const cmd1 = first.body.commandId;
    const second = await submitOrder(app, testUser.token, body, { 'X-Idempotency-Key': key });
    expect(second.status).toBe(202);
    expect(second.body.commandId).toBe(cmd1);
    expect(second.body.idempotencyKey).toBe(key);
  });

  it('conflicting payload with same idempotency key returns 409', async () => {
    const key = `idem-conflict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const body1 = { symbol: 'ETHUSD', side: 'buy', type: 'limit', quantity: 1, price: 2000 };
    const body2 = { symbol: 'ETHUSD', side: 'buy', type: 'limit', quantity: 2, price: 2000 };
    const first = await submitOrder(app, testUser.token, body1, { 'X-Idempotency-Key': key });
    expect(first.status).toBe(202);
    const second = await submitOrder(app, testUser.token, body2, { 'X-Idempotency-Key': key });
    expect(second.status).toBe(409);
  });
  afterAll(async () => {
    await testUser.cleanup();
  });
});
