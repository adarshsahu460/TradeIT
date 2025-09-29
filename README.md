# TradeIT

TradeIT is a full-stack trading simulator designed to showcase a WebSocket-powered order book, a deterministic matching engine, and a React dashboard. The stack is 100% TypeScript and structured as an npm workspace with shared types.

## Features

- **Matching engine** with FIFO limit book, market order support, and snapshot publishing.
- **WebSocket gateway** that streams order, trade, and book events to connected clients.
- **REST API** for book snapshots and order submission.
- **React dashboard** that visualises the book, recent trades, and exposes an order form.
- **Shared contract package** to keep types aligned across services.
- **Vitest test suite** covering core matching scenarios.

## Project Structure

```
TradeIT/
├── packages/
│   ├── shared/      # Shared TypeScript types and utilities
│   ├── server/      # Express + WebSocket backend
│   └── web/         # Vite + React frontend
├── tsconfig.base.json
└── README.md
```

## Getting Started

```bash
npm install
npm run dev
```

The dev script starts three processes in parallel:

- `packages/shared`: TypeScript build in `--watch` mode so downstream packages receive fresh artifacts.
- `packages/server`: HTTP + WebSocket server at `http://localhost:4000` (WS on `ws://localhost:4000/ws`).
- `packages/web`: Vite dev server at `http://localhost:5173` with API proxying to the backend.

### Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Run shared watcher, backend, and frontend together. |
| `npm run build` | Build backend and frontend bundles. Shared package builds automatically via `postinstall`. |
| `npm run lint` | Aggregate lint tasks across all packages. |
| `npm run test` | Execute test suites (Vitest) for server and web (when present). |
| `npm run dev --workspace @tradeit/server` | Run only the backend in watch mode. |
| `npm run dev --workspace @tradeit/web` | Run only the frontend dev server. |

> The root `postinstall` hook builds `@tradeit/shared` so compiled artifacts exist for consumers.

## API Overview

### REST

- `GET /health` &mdash; Service health, timestamp, and supported symbols.
- `GET /api/book/:symbol` &mdash; Current order book snapshot for a symbol.
- `POST /api/orders` &mdash; Submit an order.
  - Request body matches `OrderInput` from `@tradeit/shared`.
  - Returns acceptance status, executed trades, resting order (if any), and the latest snapshot.

### WebSocket Events (`/ws`)

Messages are JSON objects matching the `EngineEventMap` type from `@tradeit/shared`:

- `engine:hello` with available symbols.
- `book:snapshot` after every order processed.
- `trade:executed` for each fill.
- `order:accepted` / `order:rejected` results.

## Testing

Run all automated tests:

```bash
npm run test
```

You can scope tests to an individual workspace:

```bash
npm run test --workspace @tradeit/server
```

## Next Steps

- Persist orders and trades in a database.
- Introduce Kafka/Redis streams for scalable event distribution.
- Implement authentication, risk checks, and user portfolios.
- Add more comprehensive test coverage (e.g., cancels/amends, multi-symbol scenarios).

## Troubleshooting

- Ensure Node.js 18+ is installed (project verified with npm 11).
- If shared types appear stale during development, ensure `npm run dev` is running so the shared package rebuilds incrementally.
- Delete `node_modules` and rerun `npm install` if workspace links get out of sync.
