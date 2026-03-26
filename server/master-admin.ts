import { getMasterAdminWallet } from "./admin-equilibrium-auth";

/**
 * Same wallet as `ADMIN_EQUILIBRIUM_MASTER_WALLET` (Equilibrium Command Center + CRM gate).
 */
export function getMasterAdminAddress(): string | null {
  return getMasterAdminWallet();
}

export function isMasterAdminAddress(walletAddress: string | null | undefined): boolean {
  const master = getMasterAdminAddress();
  if (!master || !walletAddress) return false;
  return master.toLowerCase() === walletAddress.toLowerCase();
}

export function requireMasterAdminWallet(
  req: { headers: Record<string, string | string[] | undefined> },
): { ok: true; wallet: string } | { ok: false; status: number; error: string } {
  const master = getMasterAdminAddress();
  if (!master) {
    return {
      ok: false,
      status: 503,
      error: "ADMIN_EQUILIBRIUM_MASTER_WALLET is not configured on the server.",
    };
  }
  const raw = req.headers["x-wallet-address"];
  const wallet = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!wallet) {
    return { ok: false, status: 401, error: "x-wallet-address header required" };
  }
  if (!isMasterAdminAddress(wallet)) {
    return { ok: false, status: 403, error: "Master admin wallet only" };
  }
  return { ok: true, wallet };
}
