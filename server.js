/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads `dist/index.cjs` after `npm run build`.
 *
 * Memory engine (identity + persistence):
 *   • `GET /api/user/sync` — after wallet connect, the client sends `x-wallet-address` and
 *     `Authorization: Bearer <0x…>`; the server returns subscription (Postgres + Stripe + Mongo CRM),
 *     profile (email, join date, builder flags), and a journal snapshot. This is the global handshake
 *     so Manual Pro / CRM tiers survive refresh.
 *   • `GET /api/user-status/:wallet` — same subscription merge as sync (lighter payload); kept for
 *     legacy callers.
 *
 * Safety (do not change without ops sign-off):
 *   • Admin wallet: 0x115560812df8e7515eecc957b6796531e936edd9 (`server/fortress-admin.ts`)
 *   • Hyperliquid builder fee recipient: 0xad9be64fd7a35d99a138b87cb212baefbcdcf045 (`server/routes.ts` + client HL client)
 *
 * MongoDB (`MONGODB_URI`, optional `MONGO_VAULT_URI`):
 *   • Successful handshake logs **DATABASE_SYNC_SUCCESS** (see `server/mongo-vault.ts`).
 *   • Startup: up to 5 handshake attempts with backoff (`server/mongo-vault.ts`).
 *   • If still down: background retry every **5s** (single attempt per tick) updates CRM/vault routes.
 *   • CRM: `users` collection; vault: **`tutorial_videos`** (override `MONGO_VIDEOS_COLLECTION`; legacy `videos` merged on GET).
 *   • Signups and admin “Add Video” persist to Mongo; client logout only clears local wallet + React Query cache.
 *   • `POST /api/wallet-user/register` — idempotent CRM shell; client sends wallet headers + optional email immediately on connect.
 *
 * Client performance (bundled UI; see `client/src/components/pattern-chart.tsx`, `trading-context.tsx`):
 *   • Candle API: 2s delayed retry on failure; last **500** bars cached in **localStorage** per coin/interval to avoid “no data” flicker.
 *   • SMMA 21/200 math runs in a **Web Worker** (same formula as Hyperliquid); main thread paints only.
 *   • Hyperliquid account / open-order WS updates are **throttled (~3s)** for equity + perps UI; order book + tape poll at **3s**.
 *
 * Pattern scanner (`server/GlobalScanner.ts`, `server/universal-scanner.ts`):
 *   • Default universe: **top 50 HL perps by 24h volume + PAXG** (gold on Hyperliquid).
 *   • `PATTERN_SCAN_ENFORCE_MAX_COINS=1` cannot shrink below 50 — use `coins=` query for custom lists.
 *   • Fast-track **1m / 3m / 5m** vs higher TFs: parallel candle lanes per coin; client polls fast ~20s / slow ~3m.
 *   • **21 / 200 SMMA** on charts is unchanged; scanner geometry is **unfiltered** (SMMA is advisory per signal, not a veto).
 */
import "dotenv/config";

await import("./dist/index.cjs");
