import { DEFAULT_SYMBOLS } from "@tradeit/shared";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";

import { config } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { orderRouter } from "./routes/orders.js";
import { getRedisClient } from "./services/cache.js";

const app = express();

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

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    symbols: DEFAULT_SYMBOLS,
    service: config.serviceName,
  });
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
