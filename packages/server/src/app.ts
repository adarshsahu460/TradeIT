import cors from "cors";
import express, { Request, Response } from "express";

import { engine } from "./matching";
import { orderRouter } from "./routes/orders";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now(), symbols: engine.getSymbols() });
});

app.get("/api/book/:symbol", (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();
  engine.ensureSymbol(symbol);
  const snapshot = engine.getSnapshot(symbol);
  res.json(snapshot ?? { symbol, bids: [], asks: [] });
});

app.use("/api/orders", orderRouter);

export { app };
