import { isHyperliquidTradingSessionReady } from "@/lib/hyperliquid-client";
import { queryClient } from "@/lib/queryClient";

let lastSyncedWallet: string | null = null;

/**
 * If the browser already has an HL trading agent but CRM still shows not linked,
 * record `lifetime-handshake-complete` once per wallet per page load.
 */
export async function syncCrmBuilderLinkIfSessionReady(walletAddress: string): Promise<void> {
  const w = walletAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;
  if (!isHyperliquidTradingSessionReady(w)) return;
  if (lastSyncedWallet === w) return;

  try {
    const statusRes = await fetch(`/api/wallet-user/${encodeURIComponent(w)}`);
    if (!statusRes.ok) return;
    const status = (await statusRes.json()) as {
      exists?: boolean;
      isBuilderLinked?: boolean;
    };
    if (!status.exists || status.isBuilderLinked) {
      lastSyncedWallet = w;
      return;
    }
    const completeRes = await fetch("/api/wallet-user/lifetime-handshake-complete", {
      method: "POST",
      headers: { "x-wallet-address": w },
    });
    if (completeRes.ok) {
      lastSyncedWallet = w;
      void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
      void queryClient.invalidateQueries({ queryKey: ["fortress-crm-users"] });
    }
  } catch {
    /* non-fatal */
  }
}
