/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads `dist/index.cjs` after `npm run build`.
 *
 * MongoDB (`MONGODB_URI`, optional `MONGO_VAULT_URI`):
 *   • Startup: up to 5 handshake attempts with backoff (`server/mongo-vault.ts`).
 *   • If still down: background retry every **5s** (single attempt per tick) updates CRM/vault routes.
 *
 * Pattern scanner default: **top 50 HL perps by 24h volume + PAXG** (gold on Hyperliquid, not OANDA XAU).
 * No watchlist UI — scans are server-driven.
 *
 * Diagnostics: `GET /api/debug-db`, `GET /api/system/status`
 *
 * Sovereign admin: `0x115560812df8e7515eecc957b6796531e936edd9`
 */
import "dotenv/config";

await import("./dist/index.cjs");
