import { DEFAULT_SYMBOLS } from "@tradeit/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import { httpRequestDuration, httpRequestCounter, registry } from "./metrics/registry.js";
import { getPrismaClient } from "./db.js";
import { getRedisClient } from "./services/cache.js";
import { getProducer } from "./messaging/kafka.js";

import { config } from "./config.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { authRouter } from "./routes/auth.js";
import { orderRouter } from "./routes/orders.js";
import { authenticate } from "./auth/middleware.js";
// (already imported earlier)

const app = express();

// Correlation / trace id middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const existing = (req.headers["x-correlation-id"] || req.headers["x-request-id"]) as string | undefined;
  const correlationId = existing && existing.trim() ? existing.trim() : randomUUID();
  (req as any).correlationId = correlationId;
  req.headers["x-correlation-id"] = correlationId;
  next();
});

// Structured request logging (lightweight)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  const cid = (req as any).correlationId;
  res.on("finish", () => {
    const durationMs = Number((performance.now() - start).toFixed(2));
    logger.info({
      msg: "http_request",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
      correlationId: cid,
      userId: (req as any).user?.id,
    });
    const routeLabel = req.route?.path || req.originalUrl.split('?')[0] || 'unknown';
    httpRequestDuration.observe({ method: req.method, route: routeLabel, status: String(res.statusCode) }, durationMs / 1000);
    httpRequestCounter.inc({ method: req.method, route: routeLabel, status: String(res.statusCode) });
  });
  next();
});

// Distributed (Redis) rate limiting middleware
app.use(rateLimiter);

// CORS: allow explicit FRONTEND_URL, plus common local dev & docker static ports.
const allowedOrigins = new Set<string>();
if (config.frontendUrl) {
  // Support comma-separated list in FRONTEND_URL env
  config.frontendUrl.split(',').forEach((o) => {
    const trimmed = o.trim();
    if (trimmed) allowedOrigins.add(trimmed);
  });
}
// Add typical defaults for local dev + dockerized static site
allowedOrigins.add("http://localhost:5173");
allowedOrigins.add("http://127.0.0.1:5173");
allowedOrigins.add("http://localhost:8080");
allowedOrigins.add("http://127.0.0.1:8080");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin requests without Origin header
      if (!origin) return callback(null, true);
      if (allowedOrigins.size === 0) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Lightweight authenticated ping route (useful for rate limiter tests without hitting Kafka or other heavy deps)
app.get('/api/ping-auth', authenticate, (req: Request, res: Response) => {
  res.json({ ok: true, userId: (req as any).user?.id || null });
});

// Liveness
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now(), service: config.serviceName });
});
app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now(), service: config.serviceName });
});

// Metrics endpoint (Prometheus text format)
app.get("/metrics", async (_req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

// Readiness: check critical dependencies
app.get("/readyz", async (_req: Request, res: Response) => {
  const prisma = getPrismaClient();
  const checks: Record<string, { ok: boolean; error?: string; latencyMs?: number }> = {};
  const startDb = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Number((performance.now() - startDb).toFixed(2)) };
  } catch (e: any) {
    checks.database = { ok: false, error: e.message };
  }

  // Redis
  const redis = getRedisClient();
  if (redis) {
    const startRedis = performance.now();
    try {
      const pong = await redis.ping();
      checks.redis = { ok: pong === "PONG", latencyMs: Number((performance.now() - startRedis).toFixed(2)) };
    } catch (e: any) {
      checks.redis = { ok: false, error: e.message };
    }
  } else {
    checks.redis = { ok: false, error: "not_configured" };
  }

  // Kafka (producer metadata fetch)
  const startKafka = performance.now();
  try {
    const producer = await getProducer();
    // Indirect metadata fetch via sending an empty metadata request by producing no-op (or simply rely on internal cluster metadata access)
    // Kafkajs does not expose a direct metadata call on producer; we emulate by accessing private but guard.
    const ok = !!producer; // if connected we treat as ok; deeper validation could use an admin client.
    checks.kafka = { ok, latencyMs: Number((performance.now() - startKafka).toFixed(2)) };
  } catch (e: any) {
    checks.kafka = { ok: false, error: e.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({ status: allOk ? "ready" : "degraded", checks });
});

app.get("/api/book/:symbol", async (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const redis = getRedisClient();
    const cacheKey = `book:${symbol}`;
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.set("Cache-Control", "public, max-age=1");
        return res.json(JSON.parse(cached));
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to fetch book snapshot", error);
  }

  res.json({ symbol, bids: [], asks: [] });
});

app.use("/api/auth", authRouter);
app.use("/api/orders", orderRouter);

export { app };
