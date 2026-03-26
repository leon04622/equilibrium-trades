import { getMasterAdminWallet } from "./admin-equilibrium-auth";

/**
 * Sovereign Command Center wallet — see `server/fortress-admin.ts` (hardcoded).
 */
export function getMasterAdminAddress(): string | null {
  return getMasterAdminWallet();
}

export function isMasterAdminAddress(walletAddress: string | null | undefined): boolean {
  const master = getMasterAdminAddress();
  if (!master || !walletAddress) return false;
  return master.toLowerCase() === walletAddress.toLowerCase();
}

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Caller identity for Command Center: `x-wallet-address` wins, else `Authorization: Bearer 0x…` (master wallet).
 */
export function resolveWalletAddressFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
}): string | undefined {
  const rawX = req.headers["x-wallet-address"];
  const x = (Array.isArray(rawX) ? rawX[0] : rawX)?.trim();
  if (x) return x;

  const rawAuth = req.headers["authorization"];
  const auth = (Array.isArray(rawAuth) ? rawAuth[0] : rawAuth)?.trim();
  if (!auth) return undefined;
  const lower = auth.toLowerCase();
  if (lower.startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (ETH_ADDRESS_RE.test(token)) return token;
    return undefined;
  }
  if (lower.startsWith("wallet ")) {
    const w = auth.slice(7).trim();
    if (ETH_ADDRESS_RE.test(w)) return w;
  }
  return undefined;
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
  const wallet = resolveWalletAddressFromRequest(req)?.trim();
  if (!wallet) {
    return {
      ok: false,
      status: 401,
      error: "Send x-wallet-address or Authorization: Bearer <0xMasterWallet>",
    };
  }
  if (!isMasterAdminAddress(wallet)) {
    return { ok: false, status: 403, error: "Master admin wallet only" };
  }
  return { ok: true, wallet };
}
