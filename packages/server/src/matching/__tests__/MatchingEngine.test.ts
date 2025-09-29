import { describe, expect, it } from "vitest";

import { MatchingEngine } from "../MatchingEngine.js";

const createEngine = () => {
  const instance = new MatchingEngine();
  instance.ensureSymbol("BTC-USD");
  return instance;
};

describe("MatchingEngine", () => {
  it("matches limit orders against the book", () => {
    const instance = createEngine();

    const buyOrder = instance.placeOrder({
      userId: "user-1",
      symbol: "BTC-USD",
      side: "buy",
      type: "limit",
      price: 100,
      quantity: 1,
    });

    expect(buyOrder.status).toBe("accepted");
    expect(buyOrder.resting).toBeDefined();

    const sellOrder = instance.placeOrder({
      userId: "user-2",
      symbol: "BTC-USD",
      side: "sell",
      type: "limit",
      price: 95,
      quantity: 1,
    });

    expect(sellOrder.status).toBe("accepted");
    expect(sellOrder.trades).toHaveLength(1);
    expect(sellOrder.trades[0]?.price).toBe(100);
  });

  it("rejects limit orders without price", () => {
    const instance = createEngine();

    const result = instance.placeOrder({
      userId: "user-1",
      symbol: "BTC-USD",
      side: "buy",
      type: "limit",
      quantity: 1,
    } as never);

    expect(result.status).toBe("rejected");
  });

  it("rejects orders with non-positive quantity", () => {
    const instance = createEngine();

    const result = instance.placeOrder({
      userId: "user-1",
      symbol: "BTC-USD",
      side: "buy",
      type: "limit",
      price: 100,
      quantity: 0,
    });

    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("Quantity");
  });

  it("rejects market orders when no liquidity is available", () => {
    const instance = createEngine();

    const result = instance.placeOrder({
      userId: "user-1",
      symbol: "BTC-USD",
      side: "buy",
      type: "market",
      quantity: 0.5,
    });

    expect(result.status).toBe("rejected");
    expect(result.reason).toContain("liquidity");
  });
});
