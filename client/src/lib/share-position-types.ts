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
  const sign = s.roePct >= 0 ? "+" : "";
  return `Trading $${s.coin} perps on Equilibrium — ${dir} ${s.leverage}x · ${sign}${s.roePct.toFixed(1)}% ROE`;
}

export function tradingPageShareUrl(coin: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/trading?coin=${encodeURIComponent(coin)}`;
}
