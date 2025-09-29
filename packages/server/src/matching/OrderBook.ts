import { randomUUID } from "node:crypto";

import type { Order, OrderSide, Trade } from "@tradeit/shared";

interface PriceLevel {
  price: number;
  orders: Order[];
}

const sortBids = (a: PriceLevel, b: PriceLevel) => b.price - a.price;
const sortAsks = (a: PriceLevel, b: PriceLevel) => a.price - b.price;

const cloneOrder = (order: Order, quantity: number): Order => ({
  ...order,
  quantity,
});

export class OrderBook {
  private readonly symbol: string;
  private readonly bids: PriceLevel[] = [];
  private readonly asks: PriceLevel[] = [];
  private lastTrade?: Trade;

  public constructor(symbol: string) {
    this.symbol = symbol;
  }

  public getSymbol() {
    return this.symbol;
  }

  public getBestPrice(side: OrderSide) {
    if (side === "buy") {
      return this.asks[0]?.price;
    }
    return this.bids[0]?.price;
  }

  public snapshot() {
    return {
      symbol: this.symbol,
      bids: this.bids.map((level) => ({
        price: level.price,
        quantity: level.orders.reduce((sum, order) => sum + order.quantity, 0),
      })),
      asks: this.asks.map((level) => ({
        price: level.price,
        quantity: level.orders.reduce((sum, order) => sum + order.quantity, 0),
      })),
      lastTrade: this.lastTrade,
    };
  }

  public place(order: Order): { trades: Trade[]; restingOrder?: Order } {
    const trades: Trade[] = [];
    const oppositeSide = order.side === "buy" ? this.asks : this.bids;
    const sameSide = order.side === "buy" ? this.bids : this.asks;
    let remaining = order.quantity;

    const isMatch = (price: number) => {
      if (order.type === "market") {
        return true;
      }
      if (order.side === "buy") {
        return order.price >= price;
      }
      return order.price <= price;
    };

    while (remaining > 0 && oppositeSide.length > 0) {
      const bestLevel = oppositeSide[0];
      if (!isMatch(bestLevel.price)) {
        break;
      }

      const headOrder = bestLevel.orders[0];
      const tradedQuantity = Math.min(remaining, headOrder.quantity);

      const trade: Trade = {
        id: randomUUID(),
        takerOrderId: order.id,
        makerOrderId: headOrder.id,
        symbol: this.symbol,
        price: bestLevel.price,
        quantity: tradedQuantity,
        timestamp: Date.now(),
      };

      trades.push(trade);
      this.lastTrade = trade;

      remaining -= tradedQuantity;
      headOrder.quantity -= tradedQuantity;

      if (headOrder.quantity === 0) {
        bestLevel.orders.shift();
      }

      if (bestLevel.orders.length === 0) {
        oppositeSide.shift();
      }
    }

    if (remaining > 0 && order.type === "limit") {
      const restingOrder = cloneOrder(order, remaining);
      this.addToBook(restingOrder, sameSide);
      return { trades, restingOrder };
    }

    return { trades };
  }

  private addToBook(order: Order, book: PriceLevel[]) {
    let level = book.find((entry) => entry.price === order.price);
    if (!level) {
      level = { price: order.price, orders: [] };
      book.push(level);
      book.sort(book === this.bids ? sortBids : sortAsks);
    }

    level.orders.push(order);
  }
}
