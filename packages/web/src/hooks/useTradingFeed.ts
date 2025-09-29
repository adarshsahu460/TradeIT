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

// Normal expectation: wsUrl points directly at the gateway (e.g. ws://localhost:4001/ws)
// Some users have reported the built bundle attempting ws://localhost:8080/ (the web container itself)
// which indicates the Vite build-time env var wasn't injected (or a cached older bundle) and a
// fallback inlined by minification chose location.origin. To make the UI more robust in a
// containerized / reverse-proxy environment, we add a defensive runtime rewrite:
//  - If the provided wsUrl appears to target the same origin the SPA is served from (port 80/8080)
//    and has no explicit path segment ("/" only), we assume the intended gateway is on 4001 and
//    rewrite to that conventional port + /ws path.
//  - This preserves explicit custom values and only intervenes for the broken case.
let warnedEmpty = false;
const normaliseWsUrl = (raw: string): string => {
  try {
    if (!raw) {
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        const rewritten = `ws://${host}:4001/ws`;
        if (!warnedEmpty) {
          // eslint-disable-next-line no-console
          console.warn('[useTradingFeed] Empty WebSocket URL input; defaulting', { rewritten });
          warnedEmpty = true;
        }
        return rewritten;
      }
      return 'ws://localhost:4001/ws';
    }
    const u = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    const pathIsRoot = u.pathname === '/' || u.pathname === '';
    const servedPort = typeof window !== 'undefined' ? window.location.port : '';
    const likelyFrontendPorts = new Set(['80', '8080', '']); // '' = default 80
    // Heuristic: if pointing at the SPA origin (same host) on a typical static port, with no path, rewrite.
    if (pathIsRoot && u.hostname === (typeof window !== 'undefined' ? window.location.hostname : u.hostname) && likelyFrontendPorts.has(u.port || servedPort)) {
      const host = typeof window !== 'undefined' ? window.location.hostname : u.hostname;
      const rewritten = `ws://${host}:4001/ws`;
      if (raw !== rewritten) {
        // eslint-disable-next-line no-console
        console.warn('[useTradingFeed] Rewriting suspected incorrect WebSocket URL', { original: raw, rewritten });
      }
      return rewritten;
    }
    return u.toString().replace(/(?<!:)\/$/, ''); // strip trailing slash (not after protocol)
  } catch {
    return raw; // If URL constructor fails, fall back silently.
  }
};

export const useTradingFeed = (rawWsUrl: string): TradingFeedState => {
  const wsUrl = normaliseWsUrl(rawWsUrl);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookSnapshot>>({});
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | undefined>();

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef<number>(500);
  const reconnectAttemptsRef = useRef<number>(0);
  const MAX_FAST_RETRIES = 6;

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
        reconnectAttemptsRef.current += 1;
        if (reconnectAttemptsRef.current > MAX_FAST_RETRIES) {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 8000);
        } else {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 1.5, 4000);
        }
        connect();
      }, delay);
    };

    const connect = () => {
      if (isUnmounted) {
        return;
      }

      clearReconnectTimeout();
  reconnectDelayRef.current = 500;
  reconnectAttemptsRef.current = 0;
      setStatus("connecting");
      setError(undefined);

  // eslint-disable-next-line no-console
  console.debug('[useTradingFeed] Opening WebSocket', { wsUrl });
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
