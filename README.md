# Equilibrium Trades

Beginner-friendly trading platform: Hyperliquid integration, charts (lightweight-charts), patterns, subscriptions (Stripe), and wallet-gated flows. **Self-host on Railway, Render, or a VPS** — see **[HOSTING.md](./HOSTING.md)** (includes **migrating off Replit** and why Autoscale + missing `DATABASE_URL` breaks videos and persistence).

## Prerequisites

- **Node.js** 20+ recommended
- **PostgreSQL** (optional at boot): set `DATABASE_URL` for persistence, chat, videos, wallet users, and Stripe catalog SQL. Without it, the server still starts and uses in-memory fallbacks; `GET /health` includes `database.configured` and a short message.
- **No server yet?** See **[HOSTING.md](./HOSTING.md)** for Railway, Render, or VPS + what to put in GoDaddy DNS.

## Setup

```bash
npm install
# Copy .env.example to .env and edit (PowerShell: Copy-Item .env.example .env)
```

Fill in `.env`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres URI — **Supabase**, Neon (pooled), Railway, local Docker (see below), etc. |
| `PORT` | Optional; default `5000` |
| `PUBLIC_APP_URL` | Your live origin, e.g. `https://www.yourdomain.com` — checkout/portal return URLs & webhooks |
| `STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` | Stripe API keys (required for subscriptions / checkout) |
| `VITE_STRIPE_PAYMENT_LINK_*` | Optional overrides for [Stripe Payment Links](https://docs.stripe.com/payment-links) (defaults are set in code) |

Optional (feature-dependent):

- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` — AI / image features
- `VITE_BUILDER_ADDRESS`, `VITE_HL_REFERRAL_CODE` — Hyperliquid client (rebuild after change)
- `HL_DISABLE_CANDLE_CACHE=1` — always fetch fresh candles from HL (heavier)
Local Postgres (optional):

```bash
docker compose up -d
# Then DATABASE_URL=postgresql://equilibrium:equilibrium@localhost:5432/equilibrium
```

Push schema when DB is ready:

```bash
npm run db:push
```

## Go live on your domain

See **[HOSTING.md](./HOSTING.md)** for Railway, Render, and VPS. Env checklist: **`deploy/production.env.template`**. Run **`npm run verify`** before deploying.

1. **DNS** — Point your domain’s **A** (and **AAAA** if you use IPv6) records to your server’s public IP.
2. **Hyperliquid (build-time)** — Copy `.env.production.example` → `.env.production` and set **`VITE_BUILDER_ADDRESS`** (your HL-registered builder `0x…` wallet) and **`VITE_HL_REFERRAL_CODE`**. Run **`npm run build`** again so these are embedded in the client.
3. **Server env** — On the host, set **`PUBLIC_APP_URL=https://www.yourdomain.com`** (no trailing slash), **`DATABASE_URL`**, **`STRIPE_PUBLISHABLE_KEY`** / **`STRIPE_SECRET_KEY`**, and **`PORT`** if not using 5000.
4. **TLS reverse proxy** — Terminate HTTPS in front of Node (recommended). See **`deploy/Caddyfile.example`** for [Caddy](https://caddyserver.com/) (automatic HTTPS) proxying to `127.0.0.1:5000`.
5. **Stripe** — In the [Stripe Dashboard](https://dashboard.stripe.com), add webhook endpoint **`https://www.yourdomain.com/api/stripe/webhook`**. Configure Payment Link return URLs to your site (e.g. `/pricing?success=true`).
6. **Run** — `npm start`, or **`docker compose -f docker-compose.prod.yml up -d --build`** (see file header for required `.env` variables).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server + Vite HMR (uses `cross-env` for Windows) |
| `npm run build` | Production client (`dist/public`) + bundled server (`dist/index.cjs`) |
| `npm start` | Run production build |
| `npm run check` | TypeScript (`tsc`) |
| `npm run verify` | `check` + `build` + HTTP smoke test (spawns prod server briefly) |
| `npm run verify:live` | Smoke-test a live deployment (`LIVE_BASE_URL=https://…`) |

## Project layout

- `client/` — Vite + React UI
- `server/` — Express API, Hyperliquid, Stripe, websockets
- `shared/` — Shared types / Drizzle schema

Legacy Replit-era notes: `replit.md`. Design: `design_guidelines.md`.

Ops runbook: `docs/PRODUCTION_RUNBOOK.md`.
