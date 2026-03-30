/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads `dist/index.cjs` after `npm run build`. All HTTP routes, Mongo persistence, and the
 * pattern API live in the compiled bundle (`server/index.ts` → `server/routes.ts`, `server/mongo-vault.ts`).
 *
 * ── Full system restoration (persistence / scanner / balances) ─────────────────
 *
 * Identity (authoritative — do not rotate without ops sign-off):
 *   • Admin wallet: 0x115560812df8e7515eecc957b6796531e936edd9 (`server/fortress-admin.ts`)
 *   • Hyperliquid builder fee recipient: 0xad9be64fd7a35d99a138b87cb212baefbcdcf045
 *     (`client/src/lib/hyperliquid-platform-config.ts`, `server/routes.ts`, HL client)
 *
 * MongoDB hard-link (cures “amnesia”):
 *   • `GET /api/user/sync` — CRM `users.subTier` is merged first with Postgres + Stripe; admin tier changes use
 *     `findOneAndUpdate` upsert (`upsertMongoCrmSubscriptionAuthority`) so Pro/Mentor survives refresh.
 *   • `POST /api/user/hl-balance-snapshot` — persists perp + spot USDC + total USD to CRM after live HL poll.
 *   • `POST /api/wallet-user/register` + admin tier / CRM routes — call `syncWalletUserToMongoCrm` / vault
 *     handlers so Pro grants, videos, and CRM rows are written to Mongo immediately.
 *   • Videos: Mongo primary `videos` (MONGO_VIDEOS_COLLECTION); `GET /api/videos` merges legacy `tutorial_videos`;
 *     `POST` uses majority write concern upsert (`server/video-service.ts`).
 *
 * Client auth (`client/src/context/AuthContext.tsx`):
 *   • React Query `refetchInterval: 10_000` + `staleTime: 0` re-hydrates `subTier` and `totalBalance` from
 *     `/api/user/sync` (wallet headers only — no cookie session). `MASTER_BYPASS_WALLET_ADDRESSES` + optional
 *     `MASTER_BYPASS_WALLET_2` / `VITE_MASTER_BYPASS_WALLET_2` force Pro in UI + sync (`server/master-bypass-wallets.ts`).
 *
 * Apex / scanner (`server/GlobalScanner.ts`, `server/universal-scanner.ts`, `server/MultiPatternEngine.ts`):
 *   • Geometry-first: flags, wedges, H&S, channels, etc. are not suppressed by 21/200 SMMA (SMMA is context
 *     on cards only). Chart SMMA visuals are unchanged.
 *   • Default universe: top 50 HL perps by 24h volume + PAXG (`server/scanner-controller.ts`).
 *   • Deep lookback: `patternScanCandleLimitForInterval` uses ≥400 bars on 1h/2h/4h/1d; analysis runs
 *     with `PATTERN_SCAN_MIN_BARS` (200) so partial HL responses still emit patterns.
 *
 * Balances (`client/src/lib/trading-context.tsx`, `client/src/components/account-equity.tsx`):
 *   • Perp clearinghouse + `spotClearinghouseState` USDC; unified total = perp account value + spot USDC.
 *   • REST poll every 10s; WebSocket clearinghouse UI updates throttled to 3s for chart smoothness.
 *
 * Strict rule: do not change 21/200 SMMA chart math in the client chart worker / `pattern-chart.tsx`.
 *
 * Hyperliquid “Docs” / review pack:
 *   • Repo: `docs/EQUILIBRIUM_PLATFORM.md` — strategy, scanner spec, quick start, wallets.
 *   • In-app: client route `/docs` (`client/src/pages/Docs.tsx`).
 *   • Admin Pro/Mentor: `PATCH` tier routes **await** `syncWalletUserToMongoCrm` so Mongo mirrors Postgres
 *     before the HTTP response returns.
 */
import "dotenv/config";

await import("./dist/index.cjs");
