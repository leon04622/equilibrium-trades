/**
 * Equilibrium Trades — production Node entry (optional)
 *
 * This file loads the compiled Express application from `dist/index.cjs`.
 * The canonical start command is: `npm start` → `node dist/index.cjs`
 * Alternate: `npm run start:serverjs` → `node server.js`
 *
 * ── Admin Command Center API (all handlers use try/catch in `server/routes.ts`) ──
 *
 * Master wallet: set `ADMIN_EQUILIBRIUM_MASTER_WALLET=0xYourAddress` (replaces YOUR_MASTER_WALLET_ADDRESS).
 * Client route: `/admin` — sends `x-wallet-address` header; server enforces master on CRM endpoints.
 *
 * GET  /api/users
 * PATCH /api/users/:walletAddress/subscription
 *   Body: `{ isSubscribed: true }` (Grant Pro) | `{ removePro: true }` (Remove Pro / free + clear override)
 *
 * GET  /api/support              — master: inbox dump (support_tickets table; legacy name support_messages in docs)
 * POST /api/support              — same as /api/support/send (persist + optional Telegram)
 * POST /api/support/message      — alias
 * POST /api/support/send         — user/guest message from chat bubble
 * GET  /api/support/conversations
 * GET  /api/support/messages/:conversationId
 * POST /api/support/messages     — admin reply (also triggers WS + SSE)
 * GET  /api/support/stream/:conversationId — SSE
 *
 * WebSocket /ws/support-chat — subscribe { type, conversationId, walletAddress?, sessionId? } or
 *   { type, scope: "admin_inbox", walletAddress } for master inbox refresh.
 *
 * GET    /api/videos
 * POST   /api/videos   — body: title, description, videoUrl, optional category (free text), thumbnailPath
 * DELETE /api/videos/:id
 *
 * Source of truth for route implementations: `server/routes.ts`, `server/index.ts`, `server/support-chat-ws.ts`.
 */
import "./dist/index.cjs";
