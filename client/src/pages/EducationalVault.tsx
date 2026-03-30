/**
 * Educational Vault (`/videos`). Catalog + player: {@link VideoVault} loads from `GET /api/videos` (Mongo when connected).
 * Master-bypass / Pro wallets skip upgrade CTAs via `useSubscription`.
 */
import VideoVault from "./VideoVault";

export default function EducationalVault() {
  return <VideoVault />;
}
