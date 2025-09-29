# TradeIT

TradeIT is a full-stack trading simulator that showcases an event-driven trading stack resembling a production exchange: authenticated REST order intake → Kafka command stream → matching engine worker → Kafka market events → WebSocket fan‑out → real‑time React UI. Everything is TypeScript and organised as an npm workspace so shared contracts stay in sync across services.

## Features

- **Event-driven microservices**: an HTTP API, a dedicated matching worker, and a WebSocket gateway communicating via Kafka topics.
- **High-performance matching engine** with FIFO limit book, market order support, and real-time snapshot publishing.
- **Binary messaging** using MessagePack for low-latency Kafka communication and Redis-backed book cache for fast reads.
- **JWT authentication** with access/refresh tokens, secure cookie storage, and user management.
- **PostgreSQL persistence** (Prisma) for users, orders, trades, and refresh tokens.
- **React dashboard** that visualises the order book, recent trades, and provides an authenticated (queued) order entry form.
- **Nginx reverse proxy** (in production container) unifies frontend + API + WebSocket under a single origin (`/api/*`, `/ws`) removing CORS friction.
- **Shared contract package** to keep types aligned across services.
- **Synthetic liquidity generator** to keep demo markets active with configurable intensity.
- **Docker Compose stack** that provisions Kafka, Redis, Postgres, and all microservices with a single command.

## Project Structure

```
TradeIT/
├── docker/                  # Container runtime configuration (Nginx, etc.)
├── packages/
│   ├── shared/              # Shared TypeScript types and utilities
│   ├── server/              # API, matcher worker, and gateway services
│   └── web/                 # Vite + React frontend
├── Dockerfile               # Builds server-based services (API, matcher, gateway)
├── Dockerfile.web           # Builds static frontend image
├── docker-compose.yml       # Full production-like stack with Kafka/Redis/Postgres
├── tsconfig.base.json
└── README.md
```

### Services Overview

| Service  | Description | Default Port |
| -------- | ----------- | ------------ |
| API      | Express REST API handling auth, order intake (Kafka producer), automatic migrations, and Redis-backed book reads | 4000 |
| Matcher  | Worker that consumes Kafka order commands, drives the matching engine, persists orders/trades, and republishes market events | — |
| Gateway  | WebSocket broadcaster consuming market events from Kafka and hydrating snapshots from Redis | 4001 |
| Web      | React SPA (Vite dev server locally, Nginx in production; proxies `/api` & `/ws`) | 8080 (Docker) |

### Architecture at a Glance

```
        (HTTP /api + WS /ws on single origin via Nginx)
         ┌───────────────────────────────┐
Inbound REST /api →  │        Nginx (web image)       │ ← SPA assets (React)
         └───────────┬───────────────┬───┘
               │               │
               │               │ WebSocket upgrade `/ws`
               │               ▼
          ┌────────────────┐   Kafka: market.events    ┌──────────────┐
          │    API (4000) │ ─────────────────────────▶ │  Gateway     │
User order commands → │  (Express)    │                            │ (WS 4001)    │
          └──────┬────────┘                            └─────┬────────┘
              │  Kafka: orders.commands                    │
              ▼                                            │ WS fan‑out
            ┌────────────┐  Redis book cache                  ▼
            │  Matcher   │ ───────────────→ (book:SYMBOL)   Web Clients
            │  Worker    │
            └────────────┘
```

Kafka and Redis decouple services so each component can scale independently (e.g. multiple matcher workers or gateway replicas behind a load balancer).

## Getting Started

### 1. Bootstrap environment variables

Copy the environment template and customise it for your setup (database credentials, JWT secrets, Kafka brokers, etc.).

```bash
cp .env.example .env
```

Key variables:

| Variable | Purpose |
| -------- | ------- |
| `PORT` | REST API listen port (defaults to `4000`). |
| `GATEWAY_PORT` | WebSocket gateway listen port (defaults to `4001`). |
| `FRONTEND_URL` | Allowed CORS origin(s) for the API (comma‑separated). In production (single-origin via Nginx) this can be omitted; dev still uses `http://localhost:5173`. |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma (required). |
| `RUN_DATABASE_MIGRATIONS` | Toggle automatic Prisma migrations on API startup (`true` by default). |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets used to sign access and refresh tokens (required). |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (default `15m` / `7d`). |
| `REFRESH_TOKEN_COOKIE_NAME` / `REFRESH_TOKEN_COOKIE_SECURE` | Refresh cookie name and secure flag. |
| `KAFKA_BROKERS` | Comma-separated broker list (defaults to `localhost:29092`). In Compose the internal host is `kafka:9092`. |
| `KAFKA_ORDER_TOPIC` / `KAFKA_MARKET_TOPIC` | Kafka topics for order commands and market events. |
| `SERVICE_NAME` | Service identifier logged by each process. |
| `REDIS_URL` | Redis connection string for the book snapshot cache. |
| `ENABLE_SYNTHETIC_TRADES` | Enable/disable synthetic order flow in the matcher (`true` by default). |
| `SYNTHETIC_TRADES_INTERVAL_MS` | Interval for synthetic orders (minimum enforced at 250ms). |

### 2. Install dependencies

```bash
npm install
```

This command also runs Prisma client generation and builds the shared package so compiled artifacts exist for consumers.

### 3. Apply database migrations

```bash
npm run prisma:migrate:dev --workspace @tradeit/server
```

### 4. Run the development stack

```bash
npm run dev
```

The dev script starts five processes in parallel:

- `packages/shared`: TypeScript build watch (keeps generated artifacts fresh).
- `packages/server` (API): Express REST API on `http://localhost:4000`.
- `packages/server` (Matcher): Kafka consumer worker processing order flow.
- `packages/server` (Gateway): WebSocket server on `ws://localhost:4001/ws` broadcasting market updates.
- `packages/web`: Vite dev server on `http://localhost:5173` proxying API calls.

> Automatic migrations run on API startup by default. Set `RUN_DATABASE_MIGRATIONS=false` to disable.
> Synthetic liquidity remains enabled by default. Use `ENABLE_SYNTHETIC_TRADES=false` or tune `SYNTHETIC_TRADES_INTERVAL_MS` to adjust flow.

### 5. Optional: bring the full stack up with Docker Compose

```bash
docker compose up --build
```

Compose provisions Postgres, Redis, Kafka + Zookeeper, the API, matcher worker, gateway, and the pre-built React UI (served via Nginx on `http://localhost:8080`).

Nginx inside the `web` image proxies:

```
/api/*  → http://api:4000/api/*
/ws     → ws://gateway:4001/ws
```

Because of this the SPA can operate with *no* hard‑coded host/port for API or WebSocket — relative paths are used by default. `VITE_API_URL` / `VITE_WS_URL` remain optional for non‑Compose deployments (e.g. CDN‑hosted frontend hitting external domains).

### Deployment Modes

| Mode | Frontend Origin | API Path | WS Path | CORS Needed? | Notes |
| ---- | --------------- | -------- | ------- | ------------ | ----- |
| Dev (Vite) | http://localhost:5173 | http://localhost:4000/api | ws://localhost:4001/ws | Yes (5173 allowed) | Fast HMR, explicit ports |
| Docker Compose (Nginx) | http://localhost:8080 | /api (proxied) | /ws (proxied) | No (same origin) | `VITE_*` env optional |

If `VITE_API_URL` / `VITE_WS_URL` are *not* supplied, the web bundle gracefully falls back to relative `/api` and `/ws` endpoints.

### Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Run shared watcher plus API, matcher, gateway, and web dev servers. |
| `npm run build` | Build backend (including matcher + gateway) and frontend bundles. |
| `npm run test` | Execute test suites (Vitest) for server and web. |
| `npm run lint` | Aggregate lint tasks across all workspaces. |
| `npm run dev --workspace @tradeit/server` | Watch-mode API service only. |
| `npm run dev:matcher --workspace @tradeit/server` | Run matcher worker in watch mode. |
| `npm run dev:gateway --workspace @tradeit/server` | Run websocket gateway in watch mode. |
| `npm run dev:web` | Start only the Vite dev server. |
| `npm run prisma:migrate:dev --workspace @tradeit/server` | Apply Prisma migrations locally (requires `DATABASE_URL`). |
| `npm run prisma:migrate:deploy --workspace @tradeit/server` | Deploy migrations in production environments. |

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
  - Body matches `OrderInput` from `@tradeit/shared`.
  - Returns HTTP `202 Accepted` with a queued command identifier. Matching is asynchronous; resulting acknowledgements / trades / snapshots arrive over WebSocket.

### WebSocket Events (`/ws`)

Messages are JSON objects matching the `EngineEventMap` type from `@tradeit/shared`:

- `engine:hello` with available symbols.
- `book:snapshot` after every order processed.
- `trade:executed` for each fill.
- `order:accepted` / `order:rejected` results.

## Order Lifecycle & Messaging

1. User submits order to REST API (`POST /api/orders`).
2. API validates & enqueues an `OrderCommand` to Kafka (`orders.commands`) keyed by symbol.
3. Matcher worker consumes the command, applies the order to in‑memory books, persists trades/orders, emits `MarketEvent` to Kafka (`market.events`).
4. Gateway consumes `market.events`, materializes snapshots (with Redis assistance) and pushes events to WebSocket clients.
5. UI updates order book & trade tape in real time.

### Topics

- **Kafka `orders.commands`** — `OrderCommand` payloads from API to matcher (keyed by symbol).
- **Kafka `market.events`** — `MarketEvent` payloads (accept/reject, trades, snapshots) from matcher to gateway.
- **Redis Cache** — latest snapshots under `book:<SYMBOL>` for fast HTTP or WS hydration.

## Testing

Run all automated tests:

```bash
npm run test
```

You can scope tests to an individual workspace:

```bash
npm run test --workspace @tradeit/server
```

```bash
npm run test --workspace @tradeit/web
```

## Next Steps

- Expand automated test coverage across the new services (matcher command/event flow, websocket gateway broadcasting, auth edge cases).
- Add risk and compliance controls (exposure limits, cancel/replace handling, credit checks).
- Instrument metrics and tracing (OpenTelemetry, Prometheus) for deep observability in production.
- Harden deployment with CI pipelines, rolling deploy strategy, and blue/green database migrations.

## Operational Considerations

- **Observability**: Ship structured logs, capture metrics, and add tracing spans across Kafka boundaries before production rollout.
- **Security**: Store secrets in a vault, enforce TLS/mTLS where appropriate, add rate limiting and audit logging.
- **HA & Scaling**: Configure Kafka partitions/replication, Redis persistence or clustering, and run multiple gateway/matcher replicas behind load balancers.
- **Data Safety**: Schedule automated Postgres backups, test restore procedures, and monitor migration status.
- **Resilience**: Introduce dead-letter topics, retry policies, and alerting for consumer lag or cache unavailability.
- **Proxy Hardening**: Add rate limiting, gzip/static asset caching, and security headers (`Strict-Transport-Security`, `Content-Security-Policy`, etc.).

## Troubleshooting

- Ensure Node.js 18+ is installed (project verified with npm 11).
- If shared types appear stale during development, ensure `npm run dev` is running so the shared package rebuilds incrementally.
- Delete `node_modules` and rerun `npm install` if workspace links get out of sync.
- When running locally without Docker, start Kafka (`KAFKA_BROKERS`) and Redis (`REDIS_URL`) before the matcher/ gateway; otherwise the services will retry connections indefinitely.
- Compose users may need to prune volumes if Postgres migrations change drastically: `docker compose down --volumes`.
- **Getting 405 from Nginx**: Likely a POST went to the static root instead of `/api`. Confirm request paths.
- **CORS errors in dev**: Ensure `FRONTEND_URL` includes `http://localhost:5173`. Production proxy removes the need for CORS.
- **WebSocket not connecting**: Verify gateway container is healthy and Nginx config includes `/ws` with upgrade headers. Hard refresh to bust a cached older bundle.
