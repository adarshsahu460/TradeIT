import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";

import { config } from "./config";
import { engine } from "./matching";
import { authRouter } from "./routes/auth";
import { orderRouter } from "./routes/orders";

const app = express();

app.use(
  cors({
    origin: config.frontendUrl ?? true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now(), symbols: engine.getSymbols() });
});

app.get("/api/book/:symbol", (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  engine.ensureSymbol(symbol);
  const snapshot = engine.getSnapshot(symbol);
  res.json(snapshot ?? { symbol, bids: [], asks: [] });
});

app.use("/api/auth", authRouter);
app.use("/api/orders", orderRouter);

export { app };
