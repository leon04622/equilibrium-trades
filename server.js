/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads the compiled application from `dist/index.cjs` (same bundle as `npm start`).
 * Run `npm run build` before using this file in production.
 *
 * ── MongoDB (vault, CRM, scanner watchlist, support) ──
 * Set **`MONGODB_URI`** (or `MONGO_VAULT_URI`) to a `mongodb://` or `mongodb+srv://` URL.
 * If neither is set, the server logs: **`CRITICAL: MONGODB_URI is undefined.`**
 * Atlas: allow your host IP or `0.0.0.0/0` until networking is locked down.
 *
 * **`GET /api/system/status`** — returns `{ database: "connected" }` when Mongo is up
 * (HTTP 503 + `{ database: "disconnected" }` when not). The pattern scanner UI uses this
 * to avoid showing a false “Mongo not configured” warning when the DB is healthy.
 *
 * Default collections (override with env): CRM documents in **`users`**, vault in **`videos`**
 * (`MONGO_USERS_COLLECTION`, `MONGO_VIDEOS_COLLECTION`).
 *
 * ── Data & CRM ──
 * • PostgreSQL (`DATABASE_URL`): wallet_users, subscriptions, support_tickets, tutorial_videos, etc.
 * • MongoDB: optional vault + unified CRM user store with wallet, tier, scanner watchlist fields, etc.
 *
 * Sovereign admin: `0x115560812df8e7515eecc957b6796531e936edd9` — `server/fortress-admin.ts`
 *
 * Environment (see also `.env.example`):
 *   DATABASE_URL           — PostgreSQL URI (not Mongo)
 *   MONGODB_URI            — primary Mongo URL (standardized)
 *   MONGO_VAULT_URI        — alternate Mongo URL if you split vault from other services
 *   MONGODB_DB_NAME        — default `equilibrium`
 *   MONGO_USERS_COLLECTION — default `users`
 *   MONGO_VIDEOS_COLLECTION — default `videos`
 *   MONGO_SUPPORT_COLLECTION — optional collection name
 *   MONGO_TRADE_JOURNAL_COLLECTION — optional; default trade_journal
 *   EQUILIBRIUM_BILLING_SYNC_SECRET — optional; `x-equilibrium-billing-secret` for POST /api/billing/sync-tier
 *
 * Pattern scanner (`/api/signals/patterns`): full HL perp + active spot list (`server/global-scanner.ts`).
 * Optional cap: `PATTERN_SCAN_ENFORCE_MAX_COINS=1` with `PATTERN_SCAN_MAX_COINS`.
 */
import "dotenv/config";

await import("./dist/index.cjs");
