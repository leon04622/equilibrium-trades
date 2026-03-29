import { useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet-context";

export type RegisterWalletBody = {
  walletAddress: string;
  email?: string | null;
};

/**
 * CRM lead capture: persist wallet (and optional email) to Postgres + Mongo `users` on connect.
 * Call from a root-level component so every session registers before other API calls race.
 */
export async function registerWalletForCrm(body: RegisterWalletBody): Promise<boolean> {
  const walletAddress = body.walletAddress.trim();
  if (!walletAddress) return false;
  try {
    const res = await fetch("/api/wallet-user/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        walletAddress,
        ...(body.email != null && String(body.email).trim() !== ""
          ? { email: String(body.email).trim() }
          : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function saveCrmEmailToServer(walletAddress: string, email: string): Promise<boolean> {
  const w = walletAddress.trim();
  const em = email.trim();
  if (!w || !em) return false;
  try {
    const res = await fetch(`/api/wallet-user/${encodeURIComponent(w)}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: em }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * On wallet connect: POST wallet + default Free tier shell to DB (Mongo + app storage).
 * Idempotent per address per mount via ref.
 */
export function useCrmLeadCapture() {
  const { address, isConnected } = useWallet();
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      doneFor.current = null;
      return;
    }
    if (doneFor.current === address) return;
    doneFor.current = address;
    void registerWalletForCrm({ walletAddress: address });
  }, [isConnected, address]);
}
