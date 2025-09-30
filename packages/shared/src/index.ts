export type OrderSide = "buy" | "sell";

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  sequence?: number; // per-symbol monotonic sequence, populated post-persistence
  side: OrderSide;
  price: number;
  quantity: number;
  type: "limit" | "market";
  timestamp: number;
}

export interface Trade {
  id: string;
  takerOrderId: string;
  makerOrderId: string;
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
}

export interface OrderInput {
  userId: string;
  symbol: string;
  side: OrderSide;
  type: "limit" | "market";
  quantity: number;
  price?: number;
}

export interface OrderCommand {
  commandId: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: "limit" | "market";
  quantity: number;
  price?: number;
  timestamp: number;
  source?: string;
}

export type MarketEvent = EngineEventMap;

export interface OrderBookSnapshot {
  symbol: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  lastTrade?: Trade;
}

export interface EngineEvent<TType extends string, TPayload> {
  // Core event identity
  eventId: string; // UUID
  version: number; // schema version for forward compatibility
  type: TType;
  // Temporal fields
  producedAt: number; // ms epoch when event created
  timestamp: number; // legacy field kept for backward compatibility (same as producedAt initially)
  // Correlation / tracing
  correlationId?: string;
  // Ordering (where applicable)
  orderSequence?: number; // present for order:accepted and trade events (taker's sequence)
  // Business payload
  payload: TPayload;
}

export type EngineEventMap =
  | EngineEvent<"order:accepted", { order: Order }>
  | EngineEvent<"order:rejected", { order: OrderInput; reason: string }>
  | EngineEvent<"trade:executed", { trade: Trade }>
  | EngineEvent<"book:snapshot", { snapshot: OrderBookSnapshot }>;

export const DEFAULT_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;
export type TradingSymbol = (typeof DEFAULT_SYMBOLS)[number];
