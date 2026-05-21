import type { JsonRpcSigner } from "ethers";
import { submitEquilibriumBuilderSignin } from "@/lib/equilibrium-builder-signin";
import { ensureHyperliquidTradingSession } from "@/lib/hyperliquid-client";
import { EQUILIBRIUM_HL_BUILDER_ADDRESS_CHECKSUM } from "@/lib/equilibrium-builder-approval-message";

export { checkSubscription, type SubscriptionCheckResult } from "@/lib/check-subscription";

/** Call from order entry (LONG/SHORT) before building or sending an order. */
export type TradeReadinessGate = () => Promise<boolean>;

/** Same address as HL `approveBuilderFee` / order `builder.b` (canonical checksummed form). */
export const EQUILIBRIUM_HL_BUILDER_ADDRESS = EQUILIBRIUM_HL_BUILDER_ADDRESS_CHECKSUM;

/**
 * Shown in the first-trade handshake modal.
 * Ethereum wallets require one EIP-191 message plus separate EIP-712 prompts for approveAgent and approveBuilderFee;
 * this flow runs them back-to-back in a single user action (one modal CTA).
 */
export const TRADE_HANDSHAKE_USER_MESSAGE =
  "One-time setup (about a minute): sign in to Equilibrium, then approve your trading key and platform fee. After that, orders run without a wallet popup on every trade. The first on-chain step may include a one-time ~1 USDC account activation.";

const LIFETIME_STORAGE_PREFIX = "equilibrium_lifetime_handshake_v1";

export function lifetimeHandshakeStorageKey(wallet: string): string {
  return `${LIFETIME_STORAGE_PREFIX}_${wallet.toLowerCase()}`;
}

export function hasLocalLifetimeHandshakeDone(wallet: string | null | undefined): boolean {
  if (!wallet || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(lifetimeHandshakeStorageKey(wallet)) === "1";
  } catch {
    return false;
  }
}

export function markLocalLifetimeHandshakeDone(wallet: string): void {
  try {
    localStorage.setItem(lifetimeHandshakeStorageKey(wallet), "1");
  } catch {
    /* ignore */
  }
}

export type RunLifetimeHandshakeOptions = {
  /** When true, skip EIP-191 if the app already loaded `builderCodeApproved` from the API. */
  skipEquilibriumSignIn?: boolean;
};

/**
 * Lifetime “builder + agent” handshake for first LONG/SHORT (or unified modal).
 * Order: Equilibrium POST /approve-builder-code (optional skip), then HL approveAgent + approveBuilderFee (builder required).
 */
export { saveTradeToJournal } from "@/lib/trade-journal-client";

export async function runEquilibriumLifetimeHandshake(
  signer: JsonRpcSigner,
  walletAddress: string,
  options?: RunLifetimeHandshakeOptions,
): Promise<{ ok: true } | { ok: false; error: string; userCancelled?: boolean }> {
  if (!options?.skipEquilibriumSignIn) {
    const si = await submitEquilibriumBuilderSignin(signer, walletAddress);
    if (!si.ok) return si;
  }

  const hl = await ensureHyperliquidTradingSession(signer, { requireBuilderFee: true });
  if (!hl.success) {
    const cancelled =
      /cancelled|rejected|denied|user cancel/i.test(hl.error || "") ||
      (hl.error || "").toLowerCase().includes("cancel");
    return {
      ok: false,
      error: hl.error || "Trading handshake did not complete.",
      userCancelled: cancelled,
    };
  }

  try {
    const res = await fetch("/api/wallet-user/lifetime-handshake-complete", {
      method: "POST",
      headers: { "x-wallet-address": walletAddress },
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[TradeExecution] lifetime-handshake-complete:", j?.error || res.status);
    }
  } catch {
    /* non-fatal CRM sync */
  }

  markLocalLifetimeHandshakeDone(walletAddress);
  return { ok: true };
}
