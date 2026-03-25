import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

export function useIsAdmin() {
  const { address } = useWallet();

  const query = useQuery({
    queryKey: ["/api/wallet/is-admin", address],
    queryFn: async () => {
      const res = await fetch("/api/wallet/is-admin", {
        headers: { "x-wallet-address": address! },
      });
      if (!res.ok) return { isAdmin: false };
      return res.json() as Promise<{ isAdmin: boolean }>;
    },
    enabled: !!address,
    staleTime: 60_000,
  });

  return {
    isAdmin: query.data?.isAdmin ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
