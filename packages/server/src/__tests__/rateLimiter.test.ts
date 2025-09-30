import { describe, it, expect, beforeAll } from 'vitest';
import { config } from '../config.js';
import { __rateLimiterTest } from '../middleware/rateLimiter.js';

describe('RateLimiter', () => {
  beforeAll(() => {
    (config as any).rateLimitIpPerMin = 2;
    (config as any).rateLimitUserPerMin = 2;
    __rateLimiterTest.reset();
  });

  it('enforces user bucket capacity locally', () => {
    const uid = 'user-x';
    const cap = config.rateLimitUserPerMin;
    const first = __rateLimiterTest.consumeUser(uid, cap);
    const second = __rateLimiterTest.consumeUser(uid, cap);
    // capacity=2 so two allowed
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    const third = __rateLimiterTest.consumeUser(uid, cap);
    expect(third.allowed).toBe(false);
  });
});
