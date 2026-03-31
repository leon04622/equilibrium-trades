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
  /** Venue API agent is active on L1 for this wallet (instant trading path). */
  terminalReady: boolean;
  /** Loading builder / agent L1 snapshot. */
  isHlVerifying: boolean;
  isHlError: boolean;
  hlError: Error | null;
  hlSnapshot: ApexHlOnboardingSnapshot | undefined;
  refetchHlAuth: () => Promise<unknown>;
}

/**
 * Terminal access once the delegated agent is valid on L1. Builder fee is handled during
 * trading session setup and does not block chart access.
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

  const agentOk = hlSnapshot ? hlSnapshot.agentOnL1 : false;

  const terminalReady = gateOff || (onArb && agentOk);

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
