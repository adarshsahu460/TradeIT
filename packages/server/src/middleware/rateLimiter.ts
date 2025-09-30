import type { NextFunction, Request, Response } from "express";
import { getRedisClient } from "../services/cache.js";
import { config } from "../config.js";
import { withCorrelation } from "../logger.js";

// Redis token bucket keys
const ipKey = (ip: string) => `rl:ip:${ip}`;
const userKey = (userId: string) => `rl:user:${userId}`;

// LUA script for atomic token bucket (refill + consume 1 token)
// KEYS[1] = bucket key
// ARGV[1] = capacity
// ARGV[2] = refill_rate_per_sec
// Returns: {allowed:0/1, remaining, resetSeconds}
const lua = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local bucket = redis.call('HMGET', key, 'tokens', 'timestamp')
local tokens = tonumber(bucket[1])
local ts = tonumber(bucket[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
if now > ts then
  local delta = now - ts
  local refill = delta * rate
  tokens = math.min(capacity, tokens + refill)
  ts = now
end
local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end
redis.call('HMSET', key, 'tokens', tokens, 'timestamp', ts)
redis.call('EXPIRE', key, 60) -- keep key hot for a minute of inactivity
local reset = 0
if tokens < 1 then
  reset = math.ceil( (1 - tokens) / rate )
end
return {allowed, tokens, reset}
`;

let scriptSha: string | null = null;

// In-memory fallback buckets (used only if Redis not configured)
interface LocalBucket { tokens: number; last: number }
const localIpBuckets = new Map<string, LocalBucket>();
const localUserBuckets = new Map<string, LocalBucket>();
const localConsume = (map: Map<string, LocalBucket>, key: string, capacity: number, perMinute: number) => {
  const now = Date.now();
  let b = map.get(key);
  if (!b) {
    b = { tokens: capacity, last: now };
    map.set(key, b);
  }
  const elapsedMin = (now - b.last) / 60000;
  if (elapsedMin > 0) {
    b.tokens = Math.min(capacity, b.tokens + elapsedMin * perMinute);
    b.last = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, remaining: b.tokens, reset: b.tokens < 1 ? 1 : 0 };
  }
  return { allowed: false, remaining: b.tokens, reset: 1 };
};

async function ensureScript(redis: ReturnType<typeof getRedisClient>) {
  if (!redis) return null;
  if (scriptSha) return scriptSha;
  const sha = await (redis as any).send_command('SCRIPT', ['LOAD', lua]);
  scriptSha = typeof sha === 'string' ? sha : null;
  return scriptSha;
}

async function consume(bucketKey: string, capacity: number, perMinute: number) {
  const redis = getRedisClient();
  if (!redis) {
    return localConsume(bucketKey.startsWith('rl:ip:') ? localIpBuckets : localUserBuckets, bucketKey, capacity, perMinute);
  }
  const sha = await ensureScript(redis);
  const perSec = perMinute / 60;
  try {
  const result: any = await (redis as any).evalsha(sha!, 1, bucketKey, capacity, perSec, Math.floor(Date.now() / 1000));
    return { allowed: result[1] === 1 || result[0] === 1, remaining: result[2], reset: result[3] };
  } catch (e) {
    // On failure (e.g. script flush) retry with EVAL
    try {
  const result: any = await (redis as any).eval(lua, 1, bucketKey, capacity, perSec, Math.floor(Date.now() / 1000));
      return { allowed: result[1] === 1 || result[0] === 1, remaining: result[2], reset: result[3] };
    } catch {
      return { allowed: true, remaining: capacity, reset: 0, degraded: true };
    }
  }
}

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/healthz' || req.path === '/readyz') return next();
  const correlationId = (req as any).correlationId as string | undefined;
  const log = withCorrelation(correlationId);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = (req as any).user?.id as string | undefined;
  try {
    const ipRes = await consume(ipKey(ip), config.rateLimitIpPerMin, config.rateLimitIpPerMin);
    if (!ipRes.allowed) {
      return res.status(429).json({ status: 'error', message: 'Rate limit exceeded (ip)', reset: ipRes.reset });
    }
    if (userId) {
      const userRes = await consume(userKey(userId), config.rateLimitUserPerMin, config.rateLimitUserPerMin);
      if (!userRes.allowed) {
        return res.status(429).json({ status: 'error', message: 'Rate limit exceeded (user)', reset: userRes.reset });
      }
    }
    return next();
  } catch (e) {
    log.warn({ err: e }, 'Rate limiter degraded; allowing request');
    return next();
  }
};

// Test-only helpers (not for production use)
export const __rateLimiterTest = {
  reset() {
    localIpBuckets.clear();
    localUserBuckets.clear();
  },
  consumeUser(userId: string, capacity: number) {
    return localConsume(localUserBuckets, userKey(userId), capacity, capacity);
  },
  consumeIp(ip: string, capacity: number) {
    return localConsume(localIpBuckets, ipKey(ip), capacity, capacity);
  }
};