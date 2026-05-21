/** Estimated closed PnL in USDC for a perp position at a trigger price. */
export function calcTpslPnlUsd(
  side: "long" | "short",
  size: number,
  entryPrice: number,
  triggerPrice: number,
): number {
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(triggerPrice)
  ) {
    return 0;
  }
  return side === "long"
    ? size * (triggerPrice - entryPrice)
    : size * (entryPrice - triggerPrice);
}

export function formatTpslPnlUsd(pnl: number): string {
  if (!Number.isFinite(pnl)) return "—";
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Human label for TP/SL dialog / order entry preview. */
export function describeTpslPnlUsd(pnl: number, kind: "tp" | "sl"): string {
  if (!Number.isFinite(pnl)) return "";
  if (pnl >= 0) {
    return kind === "tp" ? `Est. profit ${formatTpslPnlUsd(pnl)}` : `Est. gain ${formatTpslPnlUsd(pnl)}`;
  }
  return `Est. loss ${formatTpslPnlUsd(pnl)}`;
}
