import { isMasterBypassWalletInList } from "@shared/schema";

/** True → treat as Pro everywhere in the client (bypasses `/api/user/sync` lag and bad tier state). */
export function isMasterBypassWallet(address: string | null | undefined): boolean {
  if (isMasterBypassWalletInList(address)) return true;
  const e = import.meta.env.VITE_MASTER_BYPASS_WALLET_2?.trim().toLowerCase();
  const a = address?.trim().toLowerCase();
  return !!e && !!a && e === a;
}
