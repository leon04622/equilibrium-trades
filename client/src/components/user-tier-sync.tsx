import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

/**
 * On wallet connect / tab focus / account change, refetch tier from API (Mongo CRM + Postgres + Stripe)
 * so Manual Pro and vault access survive refresh.
 */
export function UserTierSync() {
  const { address, isConnected } = useWallet();
  const queryClient = useQueryClient();

  const refetchTier = useCallback(() => {
    if (!isConnected || !address) return;
    void queryClient.invalidateQueries({ queryKey: ["/api/user/sync", address] });
    void queryClient.refetchQueries({ queryKey: ["/api/user/sync", address] });
    void queryClient.invalidateQueries({ queryKey: ["/api/user-status", address] });
    void queryClient.refetchQueries({ queryKey: ["/api/user-status", address] });
  }, [isConnected, address, queryClient]);

  useEffect(() => {
    refetchTier();
  }, [refetchTier]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refetchTier();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refetchTier]);

  return null;
}
