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
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number>(500);

  useEffect(() => {
    let manualClose = false;
    let isUnmounted = false;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (isUnmounted) {
        return;
      }

      clearReconnectTimeout();

      const delay = reconnectDelayRef.current;
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 8000);
        connect();
      }, delay);
    };

    const connect = () => {
      if (isUnmounted) {
        return;
      }

      clearReconnectTimeout();
      reconnectDelayRef.current = 500;
      setStatus("connecting");
      setError(undefined);

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (isUnmounted) {
          return;
        }

        reconnectDelayRef.current = 500;
        setStatus("open");
      };

      socket.onclose = (event) => {
        if (manualClose || isUnmounted) {
          return;
        }

        setStatus(event.wasClean ? "closed" : "error");
        if (!event.wasClean) {
          setError("WebSocket connection interrupted");
        }
        scheduleReconnect();
      };

      socket.onerror = (event) => {
        if (manualClose || isUnmounted) {
          return;
        }

        console.error("WebSocket error", event);
        setStatus("error");
        setError("WebSocket connection error");
        scheduleReconnect();
      };

      socket.onmessage = (message) => {
        if (isUnmounted) {
          return;
        }

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
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      manualClose = true;
      clearReconnectTimeout();
      const socket = socketRef.current;
      if (socket) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
      }
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
