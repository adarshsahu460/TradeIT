import type { IncomingOrder, ProcessedOrderResult } from "./MatchingEngine";
import type { MatchingEngine } from "./MatchingEngine";
import type { Logger } from "pino";
import { logger } from "../logger";

type SymbolSettings = {
  basePrice: number;
  minQuantity: number;
  maxQuantity: number;
  quantityDecimals: number;
  volatilityBps: number;
  spreadBps: number;
};

const DEFAULT_SETTINGS: SymbolSettings = {
  basePrice: 1_000,
  minQuantity: 1,
  maxQuantity: 5,
  quantityDecimals: 0,
  volatilityBps: 20,
  spreadBps: 5,
};

const SYMBOL_SETTINGS: Record<string, SymbolSettings> = {
  "BTC-USD": {
    basePrice: 42_000,
    minQuantity: 0.01,
    maxQuantity: 0.25,
    quantityDecimals: 4,
    volatilityBps: 25,
    spreadBps: 8,
  },
  "ETH-USD": {
    basePrice: 3_200,
    minQuantity: 0.1,
    maxQuantity: 1.5,
    quantityDecimals: 3,
    volatilityBps: 30,
    spreadBps: 10,
  },
  "SOL-USD": {
    basePrice: 150,
    minQuantity: 1,
    maxQuantity: 8,
    quantityDecimals: 2,
    volatilityBps: 40,
    spreadBps: 15,
  },
};

const chooseSymbol = (symbols: string[]): string | undefined => {
  if (symbols.length === 0) {
    return undefined;
  }
  const index = Math.floor(Math.random() * symbols.length);
  return symbols[index];
};

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

const roundQuantity = (quantity: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(quantity * factor) / factor;
};

const buildQuantity = (settings: SymbolSettings) => {
  const quantity = randomInRange(settings.minQuantity, settings.maxQuantity);
  return roundQuantity(quantity, settings.quantityDecimals);
};

const deriveMidPrice = (engine: MatchingEngine, symbol: string, settings: SymbolSettings) => {
  const snapshot = engine.getSnapshot(symbol);
  const lastPrice = snapshot?.lastTrade?.price;
  const bestBid = snapshot?.bids?.[0]?.price;
  const bestAsk = snapshot?.asks?.[0]?.price;

  if (lastPrice) {
    return lastPrice;
  }

  if (bestBid && bestAsk) {
    return (bestBid + bestAsk) / 2;
  }

  if (bestBid) {
    return bestBid;
  }

  if (bestAsk) {
    return bestAsk;
  }

  return settings.basePrice;
};

const jitterPrice = (price: number, bps: number) => price * (1 + ((Math.random() - 0.5) * bps) / 10_000);

const toBpsMultiplier = (bps: number) => 1 + bps / 10_000;

type SyntheticLiquidityOptions = {
  engine: MatchingEngine;
  persist: (result: ProcessedOrderResult) => Promise<void>;
  makerUserId: string;
  takerUserId: string;
  intervalMs: number;
  log?: Logger;
};

export const startSyntheticLiquidity = ({
  engine,
  persist,
  makerUserId,
  takerUserId,
  intervalMs,
  log = logger,
}: SyntheticLiquidityOptions): (() => void) => {
  let stopped = false;
  let running = false;

  const symbols = engine.getSymbols();
  if (symbols.length === 0) {
    log.warn("Synthetic liquidity skipped: no symbols configured");
    return () => {
      /* noop */
    };
  }

  const executeTick = async () => {
    if (stopped || running) {
      return;
    }

    running = true;

    try {
      const symbol = chooseSymbol(symbols);
      if (!symbol) {
        return;
      }

      const settings = SYMBOL_SETTINGS[symbol] ?? DEFAULT_SETTINGS;
      const midPrice = jitterPrice(deriveMidPrice(engine, symbol, settings), settings.volatilityBps);
      const quantity = buildQuantity(settings);

  const makerSide: "buy" | "sell" = Math.random() > 0.5 ? "sell" : "buy";

      const spreadMultiplier = toBpsMultiplier(settings.spreadBps);

      const makerPrice = makerSide === "sell" ? midPrice * spreadMultiplier : midPrice / spreadMultiplier;

      const makerOrder: IncomingOrder = {
        userId: makerUserId,
        symbol,
        side: makerSide,
        type: "limit",
        price: Math.max(makerPrice, 0.01),
        quantity,
      };

      const makerResult = engine.placeOrder(makerOrder);
      if (makerResult.status === "accepted") {
        await persist(makerResult);
      }

      const takerOrder: IncomingOrder = {
        userId: takerUserId,
        symbol,
        side: makerSide === "sell" ? "buy" : "sell",
        type: "market",
        quantity,
      };

      const takerResult = engine.placeOrder(takerOrder);
      if (takerResult.status === "accepted") {
        await persist(takerResult);
      }
    } catch (error) {
      log.warn({ error }, "Synthetic liquidity tick failed");
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void executeTick();
  }, intervalMs);

  log.info({ intervalMs }, "Synthetic liquidity feed started");

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(interval);
    log.info("Synthetic liquidity feed stopped");
  };
};