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
 * Fetches `GET /api/user/sync` whenever a wallet is connected — subscription, profile, and journal
 * snapshot from **Mongo + Postgres** so tier survives refresh.
 *
 * Admin Panel **Pro / Mentor** writes go through `persistUserAccessTier` → `await syncWalletUserToMongoCrm`
 * on the server; this query uses `staleTime: 0`, `refetchOnMount: "always"`, and a 10s interval so
 * `manualProOverride` and `subTier` re-hydrate and **SubscriptionGuard** does not stick on “Upgrade” blur.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useWallet();

  const syncQuery = useQuery({
    queryKey: ["/api/user/sync", address ?? ""],
    enabled: !!address && isConnected,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
