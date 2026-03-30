/**
 * Educational Vault (`/videos`). Catalog is loaded from Mongo via `GET /api/videos` for everyone;
 * {@link VideoVault} gates **playback** to Pro so titles/thumbnails stay visible after logout.
 */
import VideoVault from "./VideoVault";

export default function EducationalVault() {
  return <VideoVault />;
}
