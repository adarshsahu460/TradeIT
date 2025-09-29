# TradeIT

TradeIT is a full-stack trading simulator designed to showcase a WebSocket-powered order book, a deterministic matching engine, and a React dashboard. The stack is 100% TypeScript and structured as an npm workspace with shared types.

## Features

- **Matching engine** with FIFO limit book, market order support, and snapshot publishing.
- **WebSocket gateway** that streams order, trade, and book events to connected clients.
- **REST API** for book snapshots and order submission.
- **JWT authentication** with access/refresh tokens, secure cookie storage, and user management.
- **PostgreSQL persistence** (via Prisma ORM) for users, orders, trades, and refresh tokens.
- **React dashboard** that visualises the book, recent trades, and exposes an order form.
- **Shared contract package** to keep types aligned across services.
- **Vitest test suite** covering core matching scenarios.
- **Synthetic liquidity generator** to keep demo markets active with configurable intensity.

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

1. Copy the environment template and fill in secrets (especially the database URL and JWT secrets):

  ```bash
  cp .env.example .env
  ```

2. Install workspace dependencies and generate the Prisma client:

  ```bash
  npm install
  ```

3. Apply database migrations (PostgreSQL / Supabase connection required):

  ```bash
  npm run prisma:migrate:dev --workspace @tradeit/server
  ```

4. Start the full stack (shared watcher, API, and UI):

  ```bash
  npm run dev
  ```

The dev script starts three processes in parallel:

- `packages/shared`: TypeScript build in `--watch` mode so downstream packages receive fresh artifacts.
- `packages/server`: HTTP + WebSocket server at `http://localhost:4000` (WS on `ws://localhost:4000/ws`).
- `packages/web`: Vite dev server at `http://localhost:5173` with API proxying to the backend.

> The root `postinstall` hook runs `prisma generate` (server) and builds the shared package so compiled artifacts exist for consumers.
> The backend also runs `prisma migrate deploy` on startup by default (set `RUN_DATABASE_MIGRATIONS=false` to skip automatic migrations).
> Synthetic trade generation is enabled by default for demos. Use `ENABLE_SYNTHETIC_TRADES=false` or tweak `SYNTHETIC_TRADES_INTERVAL_MS` to change behavior.

### Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Run shared watcher, backend, and frontend together. |
| `npm run build` | Build backend and frontend bundles. Shared package builds automatically via `postinstall`. |
| `npm run lint` | Aggregate lint tasks across all packages. |
| `npm run test` | Execute test suites (Vitest) for server and web (when present). |
| `npm run dev --workspace @tradeit/server` | Run only the backend in watch mode. |
| `npm run dev --workspace @tradeit/web` | Run only the frontend dev server. |
| `npm run prisma:migrate:dev --workspace @tradeit/server` | Apply Prisma migrations locally (requires `DATABASE_URL`). |
| `npm run prisma:migrate:deploy --workspace @tradeit/server` | Deploy migrations in production. |

## Authentication Flow

- Users can register and log in with email/password (credentials stored with `bcrypt` hashes).
- Access tokens are short-lived JWTs returned to the frontend; refresh tokens are long-lived JWTs hashed and persisted in the `RefreshToken` table.
- Refresh tokens are transported via HTTP-only cookies and rotated on each refresh to mitigate replay attacks.
- The React frontend keeps the access token in memory/local storage and transparently refreshes when the API responds with `401`.

## API Overview

### REST

- `GET /health` &mdash; Service health, timestamp, and supported symbols.
- `GET /api/book/:symbol` &mdash; Current order book snapshot for a symbol.
- `POST /api/auth/register` &mdash; Create a user account.
- `POST /api/auth/login` &mdash; Issue an access token + refresh cookie.
- `POST /api/auth/refresh` &mdash; Rotate tokens (requires refresh cookie).
- `POST /api/auth/logout` &mdash; Revoke the active refresh token.
- `GET /api/auth/me` &mdash; Return the authenticated user profile.
- `POST /api/orders` &mdash; Submit an order (requires `Authorization: Bearer <accessToken>` header).
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

- Introduce Kafka/Redis streams for scalable event distribution.
- Expand risk checks (exposure limits, cancel/replace handling, user portfolios).
- Add portfolio and trade history views in the frontend dashboard.
- Add more comprehensive test coverage (e.g., cancels/amends, multi-symbol scenarios).

## Troubleshooting

- Ensure Node.js 18+ is installed (project verified with npm 11).
- If shared types appear stale during development, ensure `npm run dev` is running so the shared package rebuilds incrementally.
- Delete `node_modules` and rerun `npm install` if workspace links get out of sync.
