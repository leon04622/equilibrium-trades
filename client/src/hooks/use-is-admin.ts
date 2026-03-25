import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";
import { isAdminWallet } from "@shared/schema";

export function useIsAdmin() {
  const { address } = useWallet();
  const builtInAdmin = address ? isAdminWallet(address) : false;

  const query = useQuery({
    queryKey: ["/api/wallet/is-admin", address],
    queryFn: async () => {
      const res = await fetch("/api/wallet/is-admin", {
        headers: { "x-wallet-address": address! },
      });
      if (!res.ok) return { isAdmin: false };
      return res.json() as Promise<{ isAdmin: boolean }>;
    },
    enabled: !!address && !builtInAdmin,
    staleTime: 60_000,
  });

  return {
    isAdmin: builtInAdmin || query.data?.isAdmin === true,
    isLoading: !builtInAdmin && !!address && query.isLoading,
    refetch: query.refetch,
  };
}
