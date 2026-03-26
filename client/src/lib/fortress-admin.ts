/** Must match `server/fortress-admin.ts` — client-side gate for `/admin` only. */
export const FORTRESS_SOVEREIGN_WALLET =
  "0x115560812df8e7515eecc957b6796531e936edd9" as const;

export function isFortressSovereignWallet(address: string | null | undefined): boolean {
  if (!address?.trim()) return false;
  return address.trim().toLowerCase() === FORTRESS_SOVEREIGN_WALLET.toLowerCase();
}
