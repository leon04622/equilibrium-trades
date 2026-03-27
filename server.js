/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads the compiled application from `dist/index.cjs` (same bundle as `npm start`).
 * Run `npm run build` before using this file in production.
 *
 * ── MongoDB (Admin Command Center, Educational Vault, CRM, Support) ──
 * When `MONGO_VAULT_URI` or `MONGODB_URI` is set to a real Mongo URL (mongodb:// or
 * mongodb+srv://), videos, CRM, and support use MongoDB via `server/mongo-vault.ts`.
 * Postgres (`DATABASE_URL`) is separate — do not use the same string for both.
 *
 * Environment:
 *   MONGO_VAULT_URI      — preferred for vault/CRM/support (mongodb+srv://…)
 *   MONGODB_URI          — alternative if it is a Mongo URL (not used as Postgres anymore)
 *   MONGODB_DB_NAME      — optional, default `equilibrium`
 *   MONGO_VIDEOS_COLLECTION   — optional, default `vault_videos`
 *   MONGO_CRM_COLLECTION      — optional, default `crm_users`
 *   MONGO_SUPPORT_COLLECTION  — optional, default `support_tickets`
 *
 * Sovereign admin wallet (videos / CRM / support inbox) is hardcoded in
 * `server/fortress-admin.ts` and `client/src/lib/fortress-admin.ts`.
 */
import "dotenv/config";

await import("./dist/index.cjs");
