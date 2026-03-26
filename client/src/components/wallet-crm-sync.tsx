import { useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet-context";

const CRM_EMAIL_KEY = "equilibrium_crm_email";

/**
 * Ensures `wallet_users` has a row for the connected wallet and optional email (CRM / Command Center).
 * Email is read from localStorage (`equilibrium_crm_email`), e.g. set from Settings.
 */
export function WalletCrmSync() {
  const { address } = useWallet();
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    if (!address) {
      lastSynced.current = null;
      return;
    }
    if (lastSynced.current === address) return;
    lastSynced.current = address;

    const email = (() => {
      try {
        return localStorage.getItem(CRM_EMAIL_KEY)?.trim() || undefined;
      } catch {
        return undefined;
      }
    })();

    const body: { walletAddress: string; email?: string } = { walletAddress: address };
    if (email) body.email = email;

    void fetch("/api/wallet-user/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, [address]);

  return null;
}

export { CRM_EMAIL_KEY };
