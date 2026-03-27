import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

/**
 * On wallet connect / account change / full reload, refetch Mongo/Postgres-backed tier
 * so Pro vault and AI Signals unlock without a manual refresh.
 */
export function UserTierSync() {
  const { address, isConnected } = useWallet();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isConnected || !address) return;
    void queryClient.invalidateQueries({ queryKey: ["/api/user-status", address] });
    void queryClient.refetchQueries({ queryKey: ["/api/user-status", address] });
  }, [isConnected, address, queryClient]);

  return null;
}
