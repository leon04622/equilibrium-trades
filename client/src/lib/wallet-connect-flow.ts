import { isMobileUserAgent } from "@/lib/wallet-mobile-rabby";

/** Normalize EIP-1193 account list from wallet providers. */
export function normalizeEthAccounts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (typeof a !== "string") continue;
    const lower = a.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function requestEthAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  return normalizeEthAccounts(accounts);
}

async function tryWalletRequestPermissions(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* Rabby mobile often rejects this — eth_requestAccounts still works */
  }
}

/**
 * Request accounts from an injected wallet.
 * Mobile / Rabby: `eth_requestAccounts` first (official Rabby path).
 * Desktop: optional permissions prompt for multi-account pickers.
 */
export async function requestAccountsFromProvider(
  provider: Eip1193Provider,
  options?: { forceAccountPicker?: boolean },
): Promise<string[]> {
  const mobile = isMobileUserAgent();

  let list = await requestEthAccounts(provider);
  if (list.length > 0) return list;

  if (!mobile && options?.forceAccountPicker) {
    await tryWalletRequestPermissions(provider);
    list = await requestEthAccounts(provider);
    if (list.length > 0) return list;
  }

  if (!mobile) {
    await tryWalletRequestPermissions(provider);
    list = await requestEthAccounts(provider);
    if (list.length > 0) return list;
  }

  return readAuthorizedAccounts(provider);
}

export async function readAuthorizedAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    const existing = await provider.request({ method: "eth_accounts" });
    return normalizeEthAccounts(existing);
  } catch {
    return [];
  }
}
