import { useEffect, useRef } from "react";
import { useWallet } from "@/lib/wallet-context";

export type RegisterWalletBody = {
  walletAddress: string;
  email?: string | null;
};

export type RegisterWalletResult = {
  ok: boolean;
  /** Server JSON `success` when present */
  persisted: boolean;
};

function walletAuthHeaders(walletAddress: string): Record<string, string> {
  const w = walletAddress.trim();
  return {
    "Content-Type": "application/json",
    "x-wallet-address": w,
    Authorization: `Bearer ${w}`,
  };
}

/**
 * CRM lead capture: persist wallet (and optional email) to Postgres + Mongo `users` on connect.
 */
export async function registerWalletForCrm(body: RegisterWalletBody): Promise<RegisterWalletResult> {
  const walletAddress = body.walletAddress.trim();
  if (!walletAddress) return { ok: false, persisted: false };
  try {
    const res = await fetch("/api/wallet-user/register", {
      method: "POST",
      headers: walletAuthHeaders(walletAddress),
      credentials: "include",
      body: JSON.stringify({
        walletAddress,
        ...(body.email != null && String(body.email).trim() !== ""
          ? { email: String(body.email).trim() }
          : {}),
      }),
    });
    if (!res.ok) return { ok: false, persisted: false };
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return { ok: true, persisted: data.success !== false };
  } catch {
    return { ok: false, persisted: false };
  }
}

export async function saveCrmEmailToServer(walletAddress: string, email: string): Promise<boolean> {
  const w = walletAddress.trim();
  const em = email.trim();
  if (!w || !em) return false;
  try {
    const res = await fetch(`/api/wallet-user/${encodeURIComponent(w)}/email`, {
      method: "PATCH",
      headers: walletAuthHeaders(w),
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
    void registerWalletForCrm({ walletAddress: address }).then(() => {});
  }, [isConnected, address]);
}
