import { DEFAULT_SYMBOLS } from "@tradeit/shared";

import { config } from "../config";
import { getPrismaClient } from "../db";
import type { IncomingOrder } from "./MatchingEngine";
import { MatchingEngine } from "./MatchingEngine";
import { persistProcessedOrder } from "../services/orderPersistence";
import { ensureSystemUser } from "../services/systemUser";
import { startSyntheticLiquidity } from "./syntheticLiquidity";

export const engine = new MatchingEngine();

DEFAULT_SYMBOLS.forEach((symbol: string) => engine.ensureSymbol(symbol));

let stopSyntheticFeed: (() => void) | null = null;

export const haltSyntheticFeed = () => {
  if (stopSyntheticFeed) {
    stopSyntheticFeed();
    stopSyntheticFeed = null;
  }
};

type RestoredOrder = {
  id: string;
  userId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  remainingQuantity: number;
  createdAt: Date;
};

export const initializeMatchingEngine = async () => {
  const prisma = getPrismaClient();

  const seedUserId = await ensureSystemUser("seed@tradeit.local");

  const restingOrders: RestoredOrder[] = await prisma.order.findMany({
    where: {
      remainingQuantity: {
        gt: 0,
      },
      status: {
        in: ["open", "partial"],
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      symbol: true,
      side: true,
      type: true,
      price: true,
      remainingQuantity: true,
      createdAt: true,
    },
  });

  restingOrders.forEach((order) => {
    engine.restore({
      id: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: order.price,
      quantity: order.remainingQuantity,
      timestamp: order.createdAt.getTime(),
    });
  });

  const existingOrderCount = await prisma.order.count();

  if (config.seedBook && existingOrderCount === 0) {
    const seedOrders: IncomingOrder[] = [
      { userId: seedUserId, symbol: "BTC-USD", side: "sell", type: "limit", price: 42050, quantity: 0.25 },
      { userId: seedUserId, symbol: "BTC-USD", side: "sell", type: "limit", price: 42100, quantity: 0.4 },
      { userId: seedUserId, symbol: "BTC-USD", side: "buy", type: "limit", price: 41950, quantity: 0.3 },
      { userId: seedUserId, symbol: "ETH-USD", side: "buy", type: "limit", price: 3200, quantity: 1.1 },
      { userId: seedUserId, symbol: "ETH-USD", side: "sell", type: "limit", price: 3250, quantity: 0.9 },
    ];

    for (const order of seedOrders) {
      const result = engine.placeOrder(order);
      if (result.status === "accepted") {
        await persistProcessedOrder(result);
      }
    }
  }

  if (config.enableSyntheticTrades) {
    const makerUserId = await ensureSystemUser("synthetic-maker@tradeit.local");
    const takerUserId = await ensureSystemUser("synthetic-taker@tradeit.local");
    haltSyntheticFeed();
    stopSyntheticFeed = startSyntheticLiquidity({
      engine,
      persist: persistProcessedOrder,
      makerUserId,
      takerUserId,
      intervalMs: config.syntheticTradesIntervalMs,
    });
  } else {
    haltSyntheticFeed();
  }
};

export type { IncomingOrder, ProcessedOrderResult } from "./MatchingEngine";
