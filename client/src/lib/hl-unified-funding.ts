/**
 * Hyperliquid unified / portfolio margin account helpers for deposits, transfers, and withdrawals.
 */

const INFO_API_URL = "https://api.hyperliquid.xyz/info";

export type HlUserAbstraction =
  | "unifiedAccount"
  | "portfolioMargin"
  | "disabled"
  | "default"
  | "dexAbstraction";

export async function fetchUserAbstraction(user: string): Promise<HlUserAbstraction | null> {
  try {
    const res = await fetch(INFO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "userAbstraction", user }),
    });
    if (!res.ok) return null;
    const mode = (await res.json()) as string;
    if (
      mode === "unifiedAccount" ||
      mode === "portfolioMargin" ||
      mode === "disabled" ||
      mode === "default" ||
      mode === "dexAbstraction"
    ) {
      return mode;
    }
    return null;
  } catch {
    return null;
  }
}

export function isUnifiedStyleAbstraction(mode: HlUserAbstraction | null | undefined): boolean {
  return mode === "unifiedAccount" || mode === "portfolioMargin";
}

/**
 * Hyperliquid unified / portfolio-margin accounts expose USDC in `spotClearinghouseState`;
 * perp `clearinghouseState.withdrawable` is often 0 while spot holds the real balance.
 */
export function inferUnifiedUsdcPoolFromBalances(args: {
  spotUsdcAvailable: number;
  withdrawable: number;
  accountValue: number;
}): boolean {
  return (
    args.spotUsdcAvailable > 0.01 &&
    args.withdrawable < 0.01 &&
    args.accountValue < args.spotUsdcAvailable + 1
  );
}

export function usesUnifiedUsdcPool(args: {
  abstraction: HlUserAbstraction | null | undefined;
  spotUsdcAvailable: number;
  withdrawable: number;
  accountValue: number;
}): boolean {
  return (
    isUnifiedStyleAbstraction(args.abstraction) ||
    inferUnifiedUsdcPoolFromBalances({
      spotUsdcAvailable: args.spotUsdcAvailable,
      withdrawable: args.withdrawable,
      accountValue: args.accountValue,
    })
  );
}

/** Withdrawable USDC — unified accounts must include spot USDC (total − hold). */
export function computeEffectiveWithdrawableUsdc(args: {
  withdrawable: number;
  accountValue: number;
  marginUsed: number;
  abstraction: HlUserAbstraction | null | undefined;
  spotUsdcAvailable?: number;
}): number {
  const reported = Math.max(0, args.withdrawable);
  const spotAvail = Math.max(0, args.spotUsdcAvailable ?? 0);
  if (
    !usesUnifiedUsdcPool({
      abstraction: args.abstraction,
      spotUsdcAvailable: spotAvail,
      withdrawable: reported,
      accountValue: args.accountValue,
    })
  ) {
    return reported;
  }
  const freeEquity = Math.max(0, args.accountValue - args.marginUsed);
  return Math.max(reported, freeEquity, spotAvail);
}

export function isHyperliquidUnifiedTransferBlockedError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("unified account is active") ||
    (lower.includes("unified") && lower.includes("disabled")) ||
    (lower.includes("unified") && lower.includes("action disabled"))
  );
}

export function formatHyperliquidFundingError(raw: string): string {
  const lower = raw.toLowerCase();
  if (isHyperliquidUnifiedTransferBlockedError(raw)) {
    return UNIFIED_TRANSFER_BLOCKED;
  }
  if (
    (lower.includes("unified") || lower.includes("abstraction")) &&
    (lower.includes("transfer") || lower.includes("usdclass") || lower.includes("spot") || lower.includes("perp"))
  ) {
    return UNIFIED_TRANSFER_BLOCKED;
  }
  if (lower.includes("unified") && lower.includes("withdraw")) {
    return (
      "Withdrawal could not complete for your account mode. Try again from app.hyperliquid.xyz Portfolio → Withdraw, " +
      "or enable Unified Account in Hyperliquid Settings, then retry here."
    );
  }
  return raw;
}

export const UNIFIED_WITHDRAW_HINT =
  "Unified account: one USDC pool for spot and perp. Withdraw sends from your Hyperliquid balance to Arbitrum (≈1 USDC fee).";

export const UNIFIED_TRANSFER_BLOCKED =
  "Unified account — spot and perp share one USDC balance. Transfers are disabled by Hyperliquid. Use Withdraw to send USDC to your Arbitrum wallet, or trade perps directly — no Spot→Perp move needed.";

export const UNIFIED_SPOT_TO_PERP_SUCCESS =
  "Unified USDC enabled. Your spot and perp balances are merged — you can trade perps immediately. No separate transfer is required.";
