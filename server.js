/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads the compiled application from `dist/index.cjs` (same bundle as `npm start`).
 * Run `npm run build` before using this file in production.
 *
 * ── Data & CRM ──
 * • PostgreSQL (`DATABASE_URL`): wallet_users, subscriptions, support_tickets, tutorial_videos, etc.
 * • MongoDB (`MONGO_VAULT_URI` or `MONGODB_URI` as mongodb://…): optional vault + unified CRM `users` store
 *   (`MONGO_USERS_COLLECTION` or `MONGO_CRM_COLLECTION`, default `crm_users`) with:
 *   wallet, email, joinDate, subTier (Free/Pro/Mentor), status (Active/Expired), manualProOverride.
 *   Rows upsert on wallet register, email update, admin subscription patch, Stripe subscription poll, checkout.
 * • Support chat messages stay in your database only (Mongo or Postgres) — review in Admin → Support tab.
 *
 * Sovereign admin (Command Center, CRM, videos, support inbox): `0x115560812df8e7515eecc957b6796531e936edd9`
 * — see `server/fortress-admin.ts` and `client/src/lib/fortress-admin.ts`.
 *
 * Environment (see also `.env.example`):
 *   DATABASE_URL           — PostgreSQL URI (not Mongo)
 *   MONGO_VAULT_URI        — preferred Mongo for vault/CRM/support
 *   MONGODB_URI            — alternative Mongo URL
 *   MONGODB_DB_NAME        — default `equilibrium`
 *   MONGO_USERS_COLLECTION — optional; overrides CRM collection name for user documents
 *   MONGO_CRM_COLLECTION   — default `crm_users` when MONGO_USERS_COLLECTION unset
 *   MONGO_VIDEOS_COLLECTION, MONGO_SUPPORT_COLLECTION — optional collection names
 */
import "dotenv/config";

await import("./dist/index.cjs");
