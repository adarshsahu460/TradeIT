import type { OrderBookSnapshot } from "@tradeit/shared";

interface OrderBookProps {
  snapshot?: OrderBookSnapshot;
}

const formatNumber = (value?: number) =>
  value === undefined ? "-" : value.toLocaleString(undefined, { maximumFractionDigits: 4 });

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
          <strong>{last ? `${formatNumber(last.price)} @ ${formatNumber(last.quantity)}` : "--"}</strong>
        </div>
      </header>
      <div className="book-grid">
        <div>
          <h3>Bids</h3>
          <table>
            <thead>
              <tr>
                <th>Price</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {bids.slice(0, 10).map((level) => (
                <tr key={`bid-${level.price}`}>
                  <td>{formatNumber(level.price)}</td>
                  <td>{formatNumber(level.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Asks</h3>
          <table>
            <thead>
              <tr>
                <th>Price</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {asks.slice(0, 10).map((level) => (
                <tr key={`ask-${level.price}`}>
                  <td>{formatNumber(level.price)}</td>
                  <td>{formatNumber(level.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
