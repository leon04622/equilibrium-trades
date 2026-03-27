/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads the compiled application from `dist/index.cjs` (same bundle as `npm start`).
 * Run `npm run build` before using this file in production.
 *
 * ── MongoDB (`MONGODB_URI`) ──
 * The server connects using **`MONGODB_URI`** (preferred) or **`MONGO_VAULT_URI`**.
 * On failure it **retries the handshake up to 5 times** with backoff (see `server/mongo-vault.ts`).
 * If the variable is missing: **`CRITICAL: MONGODB_URI is undefined.`** is logged.
 *
 * **Diagnostics**
 * - `GET /api/debug-db` → `{ status: "Connected" }` or `{ status: "Disconnected", detail: "…" }`
 * - `GET /api/system/status` → `{ database: "connected" | "disconnected" }` (JSON for app use)
 *
 * Atlas: Network Access → allow **`0.0.0.0/0`** (or your host egress IPs) until locked down.
 *
 * ── Pattern scanner (DB-independent) ──
 * Default tickers when Hyperliquid universe is empty: **BTC, ETH, SOL, XRP, AVAX, LINK, PAXG**
 * (`server/scanner-controller.ts`). Mongo is **only** for optional CRM watchlist persistence.
 *
 * Candle depth default **200** per TF (required for **21/200 SMMA**); optional env
 * **`PATTERN_SCAN_CANDLE_LIMIT`** may be **≥200** only (`server/scanner-controller.ts`).
 *
 * Sovereign admin: `0x115560812df8e7515eecc957b6796531e936edd9`
 *
 * Environment (see `.env.example`):
 *   DATABASE_URL, MONGODB_URI, MONGO_VAULT_URI, MONGODB_DB_NAME,
 *   MONGO_USERS_COLLECTION, MONGO_VIDEOS_COLLECTION, PATTERN_SCAN_CANDLE_LIMIT (≥200), …
 */
import "dotenv/config";

await import("./dist/index.cjs");
