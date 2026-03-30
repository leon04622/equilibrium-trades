import { createContext, useContext, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";

export type SubscriptionSyncSlice = {
  tier: "free" | "pro" | "mentoring" | "elite";
  active: boolean;
  expiresAt: string | null;
  subTier: string;
};

export type HlBalanceSnapshot = {
  perpAccountValue: number;
  spotUsdc: number;
  totalUsd: number;
  updatedAt: string | null;
};

/** Last persisted Circle CCTP bridge step (Mongo CRM) — see `POST /api/user/cctp-bridge-progress`. */
export type CctpBridgeProgressSync = {
  stage: string;
  updatedAt: string | null;
  txHash?: string | null;
  burnTxHash?: string | null;
  messageHash?: string | null;
  cctpMessageHex?: string | null;
  attestationHex?: string | null;
  amountUsdc?: number | null;
  forwardFeeMax?: number | null;
  error?: string | null;
};

export type UserSyncResponse = {
  wallet: string;
  subscription: SubscriptionSyncSlice;
  profile: {
    email: string | null;
    joinDate: string | null;
    builderCodeApproved: boolean;
    isBuilderLinked: boolean;
    manualProOverride: boolean;
  };
  /** Last totals persisted to Mongo from the trading terminal (see `POST /api/user/hl-balance-snapshot`). */
  hlBalance: HlBalanceSnapshot | null;
  /** Same as `hlBalance.totalUsd` when present — used for quick tier/balance hydration. */
  totalBalance: number | null;
  /** Resume long CCTP flows after refresh — does not replace on-chain status. */
  cctpBridgeProgress: CctpBridgeProgressSync | null;
  journal: {
    entries: unknown[];
    stats: unknown;
    persistedToVault: boolean;
  };
};

const AuthContext = createContext<UseQueryResult<UserSyncResponse> | undefined>(undefined);

/**
 * Single wallet hydration: **`GET /api/user/sync`** on every connect. Server merges **Mongo CRM `users`**
 * (authoritative `subTier`) with Postgres + Stripe so Pro/Mentor survives refresh.
 *
 * UI must not assume **Free** until `status === "success"` — use `useSubscription().isLoading` /
 * `subscriptionHydrated` for gates (Videos, Signals, SubscriptionGuard). **Master bypass** wallets
 * (`MASTER_BYPASS_WALLET_ADDRESSES` in `@shared/schema` + optional `VITE_MASTER_BYPASS_WALLET_2`) are
 * always Pro in `useSubscription` without waiting on sync.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useWallet();
  const syncEnabled = !!address && isConnected;

  const syncQuery = useQuery({
    queryKey: ["/api/user/sync", address ?? ""],
    enabled: syncEnabled,
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchInterval: syncEnabled ? 10_000 : false,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (i) => Math.min(1500 * 2 ** i, 12_000),
    queryFn: async (): Promise<UserSyncResponse> => {
      const res = await fetch("/api/user/sync", {
        credentials: "include",
        headers: {
          "x-wallet-address": address!,
          Authorization: `Bearer ${address}`,
        },
      });
      if (!res.ok) {
        const err = new Error(`user sync failed: ${res.status}`);
        throw err;
      }
      const raw = (await res.json()) as UserSyncResponse;
      return {
        ...raw,
        hlBalance: raw.hlBalance ?? null,
        totalBalance: raw.totalBalance ?? raw.hlBalance?.totalUsd ?? null,
        cctpBridgeProgress: raw.cctpBridgeProgress ?? null,
      };
    },
  });

  return <AuthContext.Provider value={syncQuery}>{children}</AuthContext.Provider>;
}

/** Wallet + DB hydration (`/api/user/sync`). Distinct from `use-auth.ts` (HL terminal). */
export function useUserSync(): UseQueryResult<UserSyncResponse> {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useUserSync must be used within AuthProvider");
  }
  return ctx;
}

/** Re-run the global wallet hydration (same as React Query `refetch` on `/api/user/sync`). */
export function useRefetchUserSync() {
  const { refetch } = useUserSync();
  return refetch;
}
