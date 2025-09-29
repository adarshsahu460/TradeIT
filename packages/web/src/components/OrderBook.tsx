import { useMemo } from "react";
import type { OrderBookSnapshot } from "@tradeit/shared";

interface OrderBookProps {
  snapshot?: OrderBookSnapshot;
}

interface OrderBookSideProps {
  side: "bids" | "asks";
  levels: OrderBookSnapshot["bids"];
  levelLimit: number;
}

const formatNumber = (value?: number, fractionDigits = 4) =>
  value === undefined
    ? "-"
    : value.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits > 0 ? 2 : 0,
        maximumFractionDigits: fractionDigits,
      });

const OrderBookSide = ({ side, levels, levelLimit }: OrderBookSideProps) => {
  const topLevels = levels.slice(0, levelLimit);
  const maxQuantity = topLevels.reduce((max, level) => Math.max(max, level.quantity), 0) || 1;
  const cumulative = useMemo(() => {
    let running = 0;
    return topLevels.map((level) => {
      running += level.quantity;
      return running;
    });
  }, [topLevels]);

  return (
    <div className={`book-side book-side-${side}`}>
      <div className="book-side-header">
        <span>Price</span>
        <span>Size</span>
        <span>Cumulative</span>
      </div>
      <div className="book-levels">
        {topLevels.length === 0 ? (
          <div className="book-empty">Waiting for liquidity…</div>
        ) : (
          topLevels.map((level, index) => {
            const percent = Math.min(100, (level.quantity / maxQuantity) * 100);
            const isBid = side === "bids";
            const barStyle = {
              width: `${percent}%`,
            };

            return (
              <div key={`${side}-${level.price}`} className="book-level-row">
                <div className={`level-bar level-bar-${side}`} style={barStyle} aria-hidden />
                <div className="level-cells">
                  <span className={`level-price ${isBid ? "bid" : "ask"}`}>{formatNumber(level.price)}</span>
                  <span className="level-qty">{formatNumber(level.quantity, 3)}</span>
                  <span className="level-qty cumulative">{formatNumber(cumulative[index], 3)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const LEVEL_LIMIT = 16;

export function OrderBook({ snapshot }: OrderBookProps) {
  const bids = snapshot?.bids ?? [];
  const asks = snapshot?.asks ?? [];
  const last = snapshot?.lastTrade;

  return (
    <section className="order-book">
      <header>
        <h2>Order Book</h2>
        <div className="last-trade">
          <span>Last trade:</span>
          <strong>{last ? `${formatNumber(last.price)} @ ${formatNumber(last.quantity, 3)}` : "--"}</strong>
        </div>
      </header>
      <div className="book-grid">
        <OrderBookSide side="bids" levels={bids} levelLimit={LEVEL_LIMIT} />
        <OrderBookSide side="asks" levels={asks} levelLimit={LEVEL_LIMIT} />
      </div>
    </section>
  );
}
