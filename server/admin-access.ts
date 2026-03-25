import { isAdminWallet } from "@shared/schema";

function extraAdminAddresses(): string[] {
  const raw = process.env.ADMIN_WALLET_ADDRESSES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.startsWith("0x") && s.length >= 42);
}

/** Built-in admins + comma-separated `ADMIN_WALLET_ADDRESSES` (Railway / .env). */
export function isAdminAddress(walletAddress: string | null | undefined): boolean {
  if (!walletAddress) return false;
  if (isAdminWallet(walletAddress)) return true;
  const a = walletAddress.toLowerCase();
  return extraAdminAddresses().includes(a);
}
