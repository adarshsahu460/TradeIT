import { randomUUID } from "node:crypto";

import type { EngineEventMap, Order, OrderBookSnapshot, OrderInput, Trade } from "@tradeit/shared";

import { OrderBook } from "./OrderBook.js";

export type IncomingOrder = OrderInput;

export interface ProcessedOrderResult {
  status: "accepted" | "rejected";
  order?: Order;
  trades: Trade[];
  resting?: Order;
  reason?: string;
  snapshot?: OrderBookSnapshot;
}

export type EngineSubscriber = (event: EngineEventMap) => void;

export class MatchingEngine {
  private readonly books = new Map<string, OrderBook>();
  private readonly subscribers = new Set<EngineSubscriber>();

  public subscribe(callback: EngineSubscriber) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  public getSymbols() {
    return Array.from(this.books.keys()).sort();
  }

  public ensureSymbol(symbol: string) {
    if (!this.books.has(symbol)) {
      this.books.set(symbol, new OrderBook(symbol));
    }
  }

  public getSnapshot(symbol: string) {
    return this.books.get(symbol)?.snapshot();
  }

  public restore(order: Order) {
    this.ensureSymbol(order.symbol);
    const book = this.books.get(order.symbol)!;
    book.restore(order);
  }

  public placeOrder(input: IncomingOrder): ProcessedOrderResult {
    this.ensureSymbol(input.symbol);
    const orderBook = this.books.get(input.symbol)!;

    if (input.quantity <= 0) {
      const reason = "Quantity must be greater than zero.";
      const event = this.createEvent("order:rejected", {
        order: input,
        reason,
      });
      this.publish(event);
      return {
        status: "rejected",
        trades: [],
        reason,
      };
    }

    if (input.type === "limit" && (input.price === undefined || input.price <= 0)) {
      const reason = "Limit orders require a positive price.";
      const event = this.createEvent("order:rejected", {
        order: input,
        reason,
      });
      this.publish(event);
      return {
        status: "rejected",
        trades: [],
        reason,
      };
    }

    const snapshotBefore = orderBook.snapshot();
    const bestPrice = orderBook.getBestPrice(input.side);
    const referencePrice =
      input.type === "market"
        ? bestPrice ?? snapshotBefore.lastTrade?.price ?? input.price
        : input.price;

    if (input.type === "market" && (referencePrice === undefined || referencePrice <= 0)) {
      const reason = "No liquidity available to price market order.";
      const event = this.createEvent("order:rejected", {
        order: input,
        reason,
      });
      this.publish(event);
      return {
        status: "rejected",
        trades: [],
        reason,
      };
    }

    const order: Order = {
      id: randomUUID(),
      userId: input.userId,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      price: referencePrice!,
      quantity: input.quantity,
      timestamp: Date.now(),
    };

    const acceptedEvent = this.createEvent("order:accepted", { order });
    this.publish(acceptedEvent);

    const { trades, restingOrder } = orderBook.place(order);

    const tradeEvents = trades.map((trade) => this.createEvent("trade:executed", { trade }));
    tradeEvents.forEach((event) => this.publish(event));

    const snapshot = orderBook.snapshot();
    const snapshotEvent = this.createEvent("book:snapshot", { snapshot });
    this.publish(snapshotEvent);

    return {
      status: "accepted",
      order,
      trades,
      resting: restingOrder,
      snapshot,
    };
  }

  private publish(event: EngineEventMap) {
    this.subscribers.forEach((subscriber) => subscriber(event));
  }

  private createEvent<TType extends EngineEventMap["type"]>(
    type: TType,
    payload: Extract<EngineEventMap, { type: TType }>["payload"],
  ): Extract<EngineEventMap, { type: TType }> {
    return {
      type,
      payload,
      timestamp: Date.now(),
    } as Extract<EngineEventMap, { type: TType }>;
  }
}
