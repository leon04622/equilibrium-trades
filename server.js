/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads `dist/index.cjs` after `npm run build`.
 *
 * Safety (do not change without ops sign-off):
 *   • Admin wallet: 0x115560812df8e7515eecc957b6796531e936edd9 (`server/fortress-admin.ts`)
 *   • Hyperliquid builder fee recipient: 0xad9be64fd7a35d99a138b87cb212baefbcdcf045 (`server/routes.ts` + client HL client)
 *
 * MongoDB (`MONGODB_URI`, optional `MONGO_VAULT_URI`):
 *   • Startup: up to 5 handshake attempts with backoff (`server/mongo-vault.ts`).
 *   • If still down: background retry every **5s** (single attempt per tick) updates CRM/vault routes.
 *   • Pro/Mentor grants persist to **PostgreSQL `wallet_users` first**; Mongo CRM sync mirrors `subTier` when vault is up.
 *
 * Pattern scanner (`server/GlobalScanner.ts`, `server/universal-scanner.ts`):
 *   • Default universe: **top 50 HL perps by 24h volume + PAXG** (gold on Hyperliquid).
 *   • `PATTERN_SCAN_ENFORCE_MAX_COINS=1` cannot shrink below 50 — use `coins=` query for custom lists.
 *   • Fast-track **1m / 3m / 5m** vs higher TFs: parallel candle lanes per coin; client polls fast ~20s / slow ~3m.
 *   • **21 / 200 SMMA** trend guards are unchanged (Apex + SMA detection).
 */
import "dotenv/config";

await import("./dist/index.cjs");
