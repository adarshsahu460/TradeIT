import type { TradingFeedState } from "../hooks/useTradingFeed";

interface ConnectionStatusProps {
  status: TradingFeedState["status"];
  error?: string;
}

const statusColors: Record<ConnectionStatusProps["status"], string> = {
  connecting: "badge badge-warn",
  open: "badge badge-success",
  closed: "badge badge-neutral",
  error: "badge badge-error",
};

export function ConnectionStatus({ status, error }: ConnectionStatusProps) {
  const className = statusColors[status];
  return (
    <div className="status-bar">
      <span className={className}>{status.toUpperCase()}</span>
      {error ? <span className="status-error">{error}</span> : null}
    </div>
  );
}
