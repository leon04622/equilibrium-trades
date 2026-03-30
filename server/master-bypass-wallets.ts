import { isMasterBypassWalletInList } from "@shared/schema";

/** Server-side Pro bypass for `/api/user/sync` (wallet header / Bearer only — no cookie session). */
export function isMasterBypassWalletAddress(wallet: string | null | undefined): boolean {
  if (isMasterBypassWalletInList(wallet)) return true;
  const e = process.env.MASTER_BYPASS_WALLET_2?.trim().toLowerCase();
  const a = wallet?.trim().toLowerCase();
  return !!e && !!a && e === a;
}
