import { DEFAULT_SYMBOLS } from "@tradeit/shared";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

import "./App.css";
import { useAuth } from "./auth/AuthContext";
import { AuthPanel } from "./components/AuthPanel";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { OrderForm, type OrderFormValues } from "./components/OrderForm";
import { OrderBook } from "./components/OrderBook";
import { TradesFeed } from "./components/TradesFeed";
import { useTradingFeed } from "./hooks/useTradingFeed";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws";

function App() {
  const { status, error, symbols, orderBooks, trades } = useTradingFeed(WS_URL);
  const { user, authorizedFetch, logout } = useAuth();
  const [selectedSymbol, setSelectedSymbol] = useState<string>(DEFAULT_SYMBOLS[0] ?? "");

  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  const orderBook = selectedSymbol ? orderBooks[selectedSymbol] : undefined;

  const handleSymbolChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSymbol(event.target.value);
  };

  if (!user) {
    return <AuthPanel />;
  };

  const placeOrder = async (values: OrderFormValues) => {
    const response = await authorizedFetch(`${API_BASE_URL}/api/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const reason = data?.reason ?? data?.errors ?? "Order rejected";
      const message = typeof reason === "string" ? reason : JSON.stringify(reason);
      throw new Error(message);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>TradeIT Exchange</h1>
          <p className="subtitle">Real-time matching engine playground</p>
        </div>
        <div className="header-actions">
          <ConnectionStatus status={status} error={error} />
          <div className="user-chip">
            <span>{user.email}</span>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <section className="toolbar">
        <label>
          Market
          <select value={selectedSymbol} onChange={handleSymbolChange} disabled={symbols.length === 0}>
            {symbols.length === 0 ? (
              <option value="">Loading…</option>
            ) : (
              symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))
            )}
          </select>
        </label>
      </section>
      <main className="content-grid">
        <OrderBook snapshot={orderBook} />
        <aside className="sidebar">
          {selectedSymbol ? (
            <OrderForm
              symbol={selectedSymbol}
              userId={user.id}
              onSubmit={async (payload) => {
                await placeOrder(payload);
              }}
            />
          ) : null}
          {selectedSymbol ? <TradesFeed symbol={selectedSymbol} trades={trades} /> : null}
        </aside>
      </main>
    </div>
  );
}

export default App;
