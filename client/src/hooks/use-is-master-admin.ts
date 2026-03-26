import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

export type CommandCenterStatus = {
  masterConfigured: boolean;
  isMasterAdmin: boolean;
};

export function useIsMasterAdmin() {
  const { address } = useWallet();

  const { data, isLoading, error, refetch } = useQuery<CommandCenterStatus>({
    queryKey: ["/api/command-center/status", address],
    queryFn: async () => {
      const q = address ? `?address=${encodeURIComponent(address)}` : "";
      const res = await fetch(`/api/command-center/status${q}`);
      if (!res.ok) {
        return { masterConfigured: false, isMasterAdmin: false };
      }
      return res.json();
    },
    staleTime: 15_000,
  });

  return {
    isMasterAdmin: !!data?.isMasterAdmin,
    masterConfigured: !!data?.masterConfigured,
    isLoading,
    error,
    refetch,
  };
}
