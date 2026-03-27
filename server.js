/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads the compiled application from `dist/index.cjs` (same bundle as `npm start`).
 * Run `npm run build` before using this file in production.
 *
 * ── MongoDB (Admin Command Center, Educational Vault, CRM, Support) ──
 * When `MONGODB_URI` is set, videos, CRM rows, and support tickets are read/written
 * via `server/mongo-vault.ts` (bundled into `dist/index.cjs`). Without it, those
 * routes use PostgreSQL (`DATABASE_URL`) as before.
 *
 * Environment:
 *   MONGODB_URI          — required for Mongo mode (e.g. mongodb+srv://…)
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
