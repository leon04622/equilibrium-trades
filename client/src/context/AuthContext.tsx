import { createContext, useContext, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";
import { isMasterBypassWallet } from "@/lib/master-bypass-wallets";

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
 * **`SubscriptionPersistenceGate`** (inside this provider) blocks the whole app with a full-screen spinner
 * until sync succeeds for a connected wallet, so UI never flashes **Free** / upgrade blur for paying users.
 * Use **`useSubscription().isPro`** as `boolean | null`: `null` only while pending or sync error (error UI here).
 * **Master bypass** wallets skip the spinner (`MASTER_BYPASS_WALLET_ADDRESSES` + optional `VITE_MASTER_BYPASS_WALLET_2`).
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

  return (
    <AuthContext.Provider value={syncQuery}>
      <SubscriptionPersistenceGate>{children}</SubscriptionPersistenceGate>
    </AuthContext.Provider>
  );
}

/**
 * Database-first gate: no routed UI until **`/api/user/sync`** resolves (or retry on failure).
 * Mirrors `useSubscription` pending/error rules without importing that hook (avoids circular imports).
 */
export function SubscriptionPersistenceGate({ children }: { children: ReactNode }) {
  const { address, isConnected } = useWallet();
  const { status, data, isError, refetch } = useUserSync();

  const needsWalletHydration = !!(isConnected && address);
  const masterBypass = isMasterBypassWallet(address);
  const subscriptionHydrated = needsWalletHydration && status === "success" && data != null;
  const isSyncError = needsWalletHydration && isError && !masterBypass;

  if (needsWalletHydration && !masterBypass) {
    if (isSyncError) {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6">
          <p className="text-center text-sm text-muted-foreground max-w-md">
            Could not verify subscription. Your tier is loaded from the server — try again.
          </p>
          <Button type="button" onClick={() => void refetch()}>
            Retry sync
          </Button>
        </div>
      );
    }
    if (!subscriptionHydrated) {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Loading your account…</p>
        </div>
      );
    }
  }

  return <>{children}</>;
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
