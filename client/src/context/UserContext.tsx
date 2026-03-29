import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@/lib/wallet-context";
import { useUserSync } from "@/context/AuthContext";
import { registerWalletForCrm } from "@/hooks/LeadCapture";
import { CRM_EMAIL_KEY } from "@/components/wallet-crm-sync";

export type CrmWriteStatus = "idle" | "syncing" | "persisted" | "failed";

export type UserPersistenceContextValue = {
  /** POST /api/wallet-user/register outcome for the active wallet */
  crmWriteStatus: CrmWriteStatus;
  /** Latest `/api/user/sync` payload (subscription includes Mongo-backed `subTier`) */
  sync: ReturnType<typeof useUserSync>["data"];
  refetchSync: () => void;
  subTier: string | undefined;
};

const UserPersistenceContext = createContext<UserPersistenceContextValue | undefined>(undefined);

/**
 * Global persistence layer: CRM upsert on connect (write confirmation) + re-exports DB sync snapshot.
 * Place inside `AuthProvider` (uses `useUserSync`).
 */
export function UserPersistenceProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useWallet();
  const syncQuery = useUserSync();
  const [crmWriteStatus, setCrmWriteStatus] = useState<CrmWriteStatus>("idle");

  useEffect(() => {
    if (!isConnected || !address) {
      setCrmWriteStatus("idle");
      return;
    }
    let cancelled = false;
    setCrmWriteStatus("syncing");
    let email: string | undefined;
    try {
      email = localStorage.getItem(CRM_EMAIL_KEY)?.trim() || undefined;
    } catch {
      email = undefined;
    }
    void registerWalletForCrm({ walletAddress: address, email }).then((r) => {
      if (cancelled) return;
      setCrmWriteStatus(r.ok ? "persisted" : "failed");
      if (r.ok) void syncQuery.refetch();
    });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, syncQuery.refetch]);

  const value = useMemo(
    (): UserPersistenceContextValue => ({
      crmWriteStatus,
      sync: syncQuery.data,
      refetchSync: () => void syncQuery.refetch(),
      subTier: syncQuery.data?.subscription?.subTier,
    }),
    [crmWriteStatus, syncQuery.data, syncQuery.refetch],
  );

  return (
    <UserPersistenceContext.Provider value={value}>{children}</UserPersistenceContext.Provider>
  );
}

export function useUserPersistence(): UserPersistenceContextValue {
  const ctx = useContext(UserPersistenceContext);
  if (ctx === undefined) {
    throw new Error("useUserPersistence must be used within UserPersistenceProvider");
  }
  return ctx;
}
