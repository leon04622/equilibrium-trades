import { useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet-context";
import { registerWalletForCrm } from "@/hooks/LeadCapture";

export const CRM_EMAIL_KEY = "equilibrium_crm_email";

/** Per-wallet: user chose "Not now" or closed the Stay in touch modal — do not reopen on refresh. */
export function crmEmailPromptDismissedStorageKey(walletAddress: string): string {
  return `equilibrium_stay_in_touch_dismissed_${walletAddress.trim().toLowerCase()}`;
}

/**
 * Ensures CRM + `wallet_users` have a row for the connected wallet; merges email from localStorage when set.
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

    void registerWalletForCrm({ walletAddress: address, email });
  }, [address]);

  return null;
}
