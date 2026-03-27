/**
 * Pro Educational Vault (`/videos`). Gated by {@link SubscriptionGuard}; player UI stays in `VideoVault.tsx`.
 */
import { SubscriptionGuard } from "@/components/SubscriptionGuard";
import VideoVault from "./VideoVault";

export default function EducationalVault() {
  return (
    <SubscriptionGuard>
      <VideoVault />
    </SubscriptionGuard>
  );
}
