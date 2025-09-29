import { useEffect, useMemo, useRef, useState } from "react";

import type { OrderBookSnapshot, Trade } from "@tradeit/shared";

type EngineEvent =
  | {
      type: "engine:hello";
      payload: { symbols: string[] };
      timestamp: number;
    }
  | {
      type: "book:snapshot";
      payload: { snapshot: OrderBookSnapshot };
      timestamp: number;
    }
  | {
      type: "trade:executed";
      payload: { trade: Trade };
      timestamp: number;
    }
  | {
      type: "order:accepted";
      payload: unknown;
      timestamp: number;
    }
  | {
      type: "order:rejected";
      payload: { reason: string };
      timestamp: number;
    };

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export interface TradingFeedState {
  status: ConnectionStatus;
  symbols: string[];
  orderBooks: Record<string, OrderBookSnapshot>;
  trades: Trade[];
  error?: string;
}

const MAX_TRADES = 50;

const isEngineEvent = (data: unknown): data is EngineEvent => {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  return "type" in data && typeof (data as { type: unknown }).type === "string";
};

export const useTradingFeed = (wsUrl: string): TradingFeedState => {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookSnapshot>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | undefined>();

  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
  const socket = new WebSocket(wsUrl);
  socketRef.current = socket;

    setStatus("connecting");
    setError(undefined);

    socket.addEventListener("open", () => {
      setStatus("open");
    });

    socket.addEventListener("close", () => {
      setStatus("closed");
    });

    socket.addEventListener("error", (event) => {
      console.error("WebSocket error", event);
      setStatus("error");
      setError("WebSocket connection error");
    });

    socket.addEventListener("message", (message) => {
      try {
        const parsed = JSON.parse(message.data as string);
        if (!isEngineEvent(parsed)) {
          return;
        }

        switch (parsed.type) {
          case "engine:hello":
            setSymbols(parsed.payload.symbols);
            break;
          case "book:snapshot": {
            const snapshot = parsed.payload.snapshot;
            setOrderBooks((prev: Record<string, OrderBookSnapshot>) => ({
              ...prev,
              [snapshot.symbol]: snapshot,
            }));
            break;
          }
          case "trade:executed": {
            const trade = parsed.payload.trade;
            setTrades((prev: Trade[]) => {
              const next = [trade, ...prev];
              return next.slice(0, MAX_TRADES);
            });
            break;
          }
          case "order:rejected":
            setError(parsed.payload.reason);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message", err);
        setError("Unable to parse WebSocket message");
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [wsUrl]);

  return useMemo(
    () => ({
      status,
      symbols,
      orderBooks,
      trades,
      error,
    }),
    [status, symbols, orderBooks, trades, error],
  );
};
