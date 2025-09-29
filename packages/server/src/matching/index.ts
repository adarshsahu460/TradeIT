import { DEFAULT_SYMBOLS } from "@tradeit/shared";

import type { IncomingOrder } from "./MatchingEngine";
import { MatchingEngine } from "./MatchingEngine";

export const engine = new MatchingEngine();

DEFAULT_SYMBOLS.forEach((symbol: string) => engine.ensureSymbol(symbol));

const seedBook = () => {
		const orders: IncomingOrder[] = [
			{ userId: "seed-1", symbol: "BTC-USD", side: "sell", type: "limit", price: 42050, quantity: 0.25 },
			{ userId: "seed-2", symbol: "BTC-USD", side: "sell", type: "limit", price: 42100, quantity: 0.4 },
			{ userId: "seed-3", symbol: "BTC-USD", side: "buy", type: "limit", price: 41950, quantity: 0.3 },
			{ userId: "seed-4", symbol: "ETH-USD", side: "buy", type: "limit", price: 3200, quantity: 1.1 },
			{ userId: "seed-5", symbol: "ETH-USD", side: "sell", type: "limit", price: 3250, quantity: 0.9 },
		];

	orders.forEach((order) => engine.placeOrder(order));
};

if (process.env.NODE_ENV !== "test") {
	seedBook();
}

export type { IncomingOrder, ProcessedOrderResult } from "./MatchingEngine";
