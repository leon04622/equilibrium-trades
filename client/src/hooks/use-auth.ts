import { useQuery } from "@tanstack/react-query";
import { useWallet, ARBITRUM_CHAIN_ID } from "@/lib/wallet-context";
import {
  fetchApexHlOnboardingSnapshot,
  type ApexHlOnboardingSnapshot,
} from "@/lib/hyperliquid-onboarding";
import { getHyperliquidLocalAgentAddress } from "@/lib/hyperliquid-client";
import { isTerminalAuthDisabled } from "@/lib/apex-auth-flags";

export interface UseAuthResult {
  address: string | null;
  isConnected: boolean;
  chainId: number | null;
  /** Hyperliquid L1 + local agent satisfy Apex Terminal requirements. */
  terminalReady: boolean;
  /** Loading referral / builder / agent L1 snapshot. */
  isHlVerifying: boolean;
  isHlError: boolean;
  hlError: Error | null;
  hlSnapshot: ApexHlOnboardingSnapshot | undefined;
  refetchHlAuth: () => Promise<unknown>;
}

/**
 * Session model: wallet connection + Arbitrum + HL referral (or pre-existing other referrer)
 * + builder fee threshold (when configured) + approveAgent visible on L1 for the stored key.
 */
export function useAuth(): UseAuthResult {
  const { address, isConnected, chainId } = useWallet();

  const onArb = isConnected && chainId === ARBITRUM_CHAIN_ID && !!address;
  const gateOff = isTerminalAuthDisabled();
  const localAgent = address ? getHyperliquidLocalAgentAddress(address) : null;

  const {
    data: hlSnapshot,
    isLoading,
    refetch,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["apex-hl-onboarding", address, localAgent],
    queryFn: () => fetchApexHlOnboardingSnapshot(address!, localAgent),
    enabled: onArb && !gateOff,
    staleTime: 45_000,
    retry: 2,
  });

  const referralOk = hlSnapshot ? hlSnapshot.referral !== "none" : false;
  const builderOk = hlSnapshot ? hlSnapshot.builderFeeOk : false;
  const agentOk = hlSnapshot ? hlSnapshot.agentOnL1 : false;

  const terminalReady =
    gateOff || (onArb && referralOk && builderOk && agentOk);

  return {
    address,
    isConnected,
    chainId,
    terminalReady,
    isHlVerifying: onArb && !gateOff && (isLoading || isFetching),
    isHlError: onArb && !gateOff && isError,
    hlError: error instanceof Error ? error : error ? new Error(String(error)) : null,
    hlSnapshot,
    refetchHlAuth: refetch,
  };
}
