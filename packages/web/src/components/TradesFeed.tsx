import type { Trade } from "@tradeit/shared";

interface TradesFeedProps {
  symbol: string;
  trades: Trade[];
}

const formatNumber = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 4 });

export function TradesFeed({ symbol, trades }: TradesFeedProps) {
  const filtered = trades.filter((trade) => trade.symbol === symbol).slice(0, 20);

  return (
    <section className="trades-feed">
      <h2>Recent Trades</h2>
      <ul>
        {filtered.length === 0 ? (
          <li className="empty">Waiting for trades…</li>
        ) : (
          filtered.map((trade) => (
            <li key={trade.id}>
              <span>{new Date(trade.timestamp).toLocaleTimeString()}</span>
              <span>{formatNumber(trade.price)}</span>
              <span>{formatNumber(trade.quantity)}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
