import { getAddress } from "ethers";

/** Single sovereign wallet — Command Center, video CRUD, CRM, and support inbox. */
export const FORTRESS_SOVEREIGN_WALLET_RAW =
  "0x115560812df8e7515eecc957b6796531e936edd9" as const;

let cachedChecksummed: string | null = null;

export function getFortressSovereignWallet(): string {
  if (!cachedChecksummed) {
    cachedChecksummed = getAddress(FORTRESS_SOVEREIGN_WALLET_RAW);
  }
  return cachedChecksummed;
}

export function isFortressSovereignAddress(wallet: string | null | undefined): boolean {
  if (!wallet?.trim()) return false;
  try {
    return getAddress(wallet.trim()).toLowerCase() === getFortressSovereignWallet().toLowerCase();
  } catch {
    return wallet.trim().toLowerCase() === FORTRESS_SOVEREIGN_WALLET_RAW.toLowerCase();
  }
}
