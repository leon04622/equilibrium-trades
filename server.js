/**
 * Equilibrium Trades — production Node entry (`npm run start:serverjs`)
 *
 * Loads `dist/index.cjs` after `npm run build`.
 *
 * Identity (authoritative references — do not rotate without ops sign-off):
 *   • Admin wallet: 0x115560812df8e7515eecc957b6796531e936edd9 (`server/fortress-admin.ts`)
 *   • Hyperliquid builder fee recipient: 0xad9be64fd7a35d99a138b87cb212baefbcdcf045 (`server/routes.ts` + client HL client)
 *
 * Memory engine (wallet + CRM):
 *   • `GET /api/user/sync` — client sends `x-wallet-address` + `Authorization: Bearer <0x…>` on connect;
 *     merges Postgres `wallet_users`, Stripe, and Mongo CRM (`users` collection). `refetchOnMount: "always"`
 *     + `staleTime: 0` on the client re-hydrates tier every navigation/refresh so **Grant Pro** and
 *     `manualProOverride` survive reloads.
 *   • `PATCH /api/admin/update-tier` — persists tier + `manualProOverride` via `persistUserAccessTier` then
 *     `await syncWalletUserToMongoCrm` so Mongo mirrors Postgres even when Stripe is idle.
 *   • Mongo CRM readers: `manualProOverride` alone upgrades inferred tier when `subscriptionTier` was stale
 *     (`inferSubscriptionTierString` + `mongoSubscriptionSnapshotToPayload`).
 *
 * Pattern scanner (`server/GlobalScanner.ts`, `server/universal-scanner.ts`, `server/MultiPatternEngine.ts`):
 *   • Default universe: top 50 HL perps by 24h volume + PAXG; optional full HL universe via env / API.
 *   • **Geometry is not vetoed by 21/200 SMMA** — bull/bear setups both emit; SMMA remains context on each card.
 *   • Chart SMMA math is unchanged (`client` worker + `pattern-chart.tsx`); only scanner ranking / labels were
 *     decoupled from trend alignment.
 */
import "dotenv/config";

await import("./dist/index.cjs");
