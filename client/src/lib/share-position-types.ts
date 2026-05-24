/** Snapshot for share card / export (from open position row). */
export type SharePositionSnapshot = {
  coin: string;
  side: "long" | "short";
  leverage: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  roePct: number;
};

export function defaultShareCaption(s: SharePositionSnapshot): string {
  const dir = s.side === "long" ? "Long" : "Short";
  const pnlSign = s.unrealizedPnl >= 0 ? "+" : "-";
  const pnlAbs = Math.abs(s.unrealizedPnl);
  const pnlStr =
    pnlAbs >= 1000
      ? pnlAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : pnlAbs.toFixed(2);
  const roeSign = s.roePct >= 0 ? "+" : "";
  return `Trading $${s.coin} perps on Equilibrium — ${dir} ${s.leverage}x · ${pnlSign}$${pnlStr} · ${roeSign}${s.roePct.toFixed(1)}% ROE`;
}

export function tradingPageShareUrl(coin: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/trading?coin=${encodeURIComponent(coin)}`;
}
