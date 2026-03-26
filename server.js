/**
 * Equilibrium Trades — production Node entry
 *
 * Loads the compiled Express app from `dist/index.cjs`.
 *   npm start          → node dist/index.cjs
 *   npm run start:serverjs → node server.js (same bundle)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortress admin (hardcoded sovereign wallet)
 * ─────────────────────────────────────────────────────────────────────────────
 * Source of truth: `server/fortress-admin.ts` (must match `client/src/lib/fortress-admin.ts`).
 * Video CRUD, CRM, leads list, and Command Center APIs require that wallet in
 * `x-wallet-address` or `Authorization: Bearer <0x…>`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Database (PostgreSQL + Drizzle)
 * ─────────────────────────────────────────────────────────────────────────────
 * Set `DATABASE_URL` (Supabase/Neon/Railway). `MONGODB_URI` is only accepted as a
 * legacy alias for a Postgres URI — this app does not use MongoDB.
 *
 * Collections (tables):
 *   • users / CRM     → wallet_users
 *   • videos / Vault  → tutorial_videos
 *   • support         → support_tickets
 *
 * ── Videos (Educational Vault + Command Center) ──
 * GET    /api/videos              — public list
 * POST   /api/videos              — sovereign only; { title, category, description?, videoUrl, thumbnailUrl? }
 * DELETE /api/videos/:id          — sovereign only
 * POST   /api/admin/videos        — alias of POST /api/videos
 * DELETE /api/admin/videos/:id    — alias of DELETE /api/videos/:id
 *
 * ── CRM ──
 * GET /api/crm/users              — sovereign only → [{ wallet, email, joinDate, subTier }]
 * GET /api/admin/users            — sovereign only (full wallet_users rows)
 * GET /api/users                  — sovereign only (same as admin/users)
 *
 * ── Support (no Telegram) ──
 * POST /api/support/chat          — alias of POST /api/support/send (same body + headers)
 * POST /api/support/send
 * GET  /api/support               — sovereign: all messages (limit query)
 *
 * Route implementations: `server/routes.ts`, `server/index.ts`.
 */
import "./dist/index.cjs";
