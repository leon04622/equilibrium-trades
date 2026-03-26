/**
 * Equilibrium Trades — production Node entry (optional)
 *
 * This file loads the compiled Express application from `dist/index.cjs`.
 * Canonical start: `npm start` → `node dist/index.cjs`
 * Alternate: `npm run start:serverjs` → `node server.js`
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin “collections” (PostgreSQL / Drizzle — single source of truth)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * • users (CRM)     → table `wallet_users` — wallet, email, subscription tier
 * • videos (Vault) → table `tutorial_videos` — title, category, youtube_id / video_path, academy_section
 * • messages (Support) → table `support_tickets` — chat + Telegram webhook when env is set
 *
 * Master wallet: `ADMIN_EQUILIBRIUM_MASTER_WALLET=0xYourAddress`
 * App admins: `ADMIN_WALLET_ADDRESSES` — video CRUD; CRM tabs in UI stay master-only.
 * Command Center client: `/admin` — sends header `x-wallet-address`.
 *
 * ── Videos (Vault + Command Center) ──
 * GET    /api/videos              — public list for Educational Vault
 * POST   /api/videos              — master or admin list; JSON { title, category, videoUrl, description?, thumbnailUrl? }
 * DELETE /api/videos/:id          — master or admin list
 * POST   /api/admin/videos        — alias of POST /api/videos
 * DELETE /api/admin/videos/:id    — alias of DELETE /api/videos/:id
 *
 * ── Users (CRM) ──
 * GET    /api/users               — master only
 * PATCH  /api/users/:walletAddress/subscription — Grant Pro / Remove Pro
 *
 * ── Support / messages ──
 * GET    /api/support             — master: inbox
 * POST   /api/support             — persist user message + optional Telegram (same as /api/support/send)
 * POST   /api/support/message     — alias
 * POST   /api/support/send        — chat bubble ingest
 * POST   /api/support/messages    — admin reply (WS + SSE)
 * GET    /api/support/conversations
 * GET    /api/support/messages/:conversationId
 * GET    /api/support/stream/:conversationId — SSE
 *
 * WebSocket /ws/support-chat — subscribe with conversationId or scope `admin_inbox` + master wallet.
 *
 * Route implementations: `server/routes.ts`, `server/index.ts`, `server/support-chat-ws.ts`.
 */
import "./dist/index.cjs";
