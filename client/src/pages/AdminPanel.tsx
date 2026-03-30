/**
 * Admin Panel — Command Center (sovereign wallet `0x115560812df8e7515eecc957b6796531e936edd9` or env master).
 *
 * Persistence (when `MONGODB_URI` / `MONGO_VAULT_URI` connects — see server `DATABASE_SYNC_SUCCESS` log):
 * - **Live CRM**: `users` collection (wallet, email, joinDate, `subTier`, `subscriptionTier`, `manualProOverride`).
 * - **Educational vault**: Mongo `videos` (configurable) via `server/video-service.ts` + POST/GET `/api/videos`.
 * - **Manual Pro**: PATCH `/api/admin/update-tier` writes Postgres + Mongo so refresh keeps Pro.
 *
 * Hyperliquid builder fee recipient: `0xad9be64fd7a35d99a138b87cb212baefbcdcf045`.
 */
export { default } from "./AdminCommandCenter";
