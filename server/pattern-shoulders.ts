import type { HyperliquidCandle } from "./hyperliquid";
import type { DetectedPattern } from "./sma-detection";

/** Pivot highs / lows (fractal) — H&S and market-bias copy. */
export function findPivotHighsLows(
  candles: HyperliquidCandle[],
  lookback: number,
): { highs: { price: number; idx: number }[]; lows: { price: number; idx: number }[] } {
  const highs: { price: number; idx: number }[] = [];
  const lows: { price: number; idx: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = parseFloat(candles[i].h);
    const l = parseFloat(candles[i].l);
    let isH = true;
    let isL = true;
    for (let j = 1; j <= lookback; j++) {
      if (parseFloat(candles[i - j].h) >= h || parseFloat(candles[i + j].h) >= h) isH = false;
      if (parseFloat(candles[i - j].l) <= l || parseFloat(candles[i + j].l) <= l) isL = false;
    }
    if (isH) highs.push({ price: h, idx: i });
    if (isL) lows.push({ price: l, idx: i });
  }
  return { highs, lows };
}

/** Uses up to 200 recent bars so 4h/1d scans see full macro shoulders when candle depth ≥ 400. */
export function detectHeadAndShoulders(candles: HyperliquidCandle[]): DetectedPattern | null {
  if (candles.length < 80) return null;
  const win = Math.min(200, candles.length);
  const slice = candles.slice(-win);
  const { highs, lows } = findPivotHighsLows(slice, 3);
  if (highs.length < 3) return null;
  const L = highs[highs.length - 3];
  const H = highs[highs.length - 2];
  const R = highs[highs.length - 1];
  if (!(L.idx < H.idx && H.idx < R.idx)) return null;
  if (!(H.price > L.price && H.price > R.price)) return null;
  const midSh = (L.price + R.price) / 2;
  if (Math.abs(L.price - R.price) / midSh > 0.035) return null;
  const between = slice.slice(L.idx, R.idx + 1);
  const neckline = Math.min(...between.map((c) => parseFloat(c.l)));
  if (neckline >= H.price * 0.995) return null;
  const currentPrice = parseFloat(slice[slice.length - 1].c);
  let status: DetectedPattern["status"] = "forming";
  if (currentPrice < neckline * 0.997) status = "breakout_confirmed";
  else if (currentPrice < neckline) status = "breakout_pending";
  const height = H.price - neckline;
  return {
    name: "head_and_shoulders",
    displayName: "Head and Shoulders",
    status,
    entryPrice: currentPrice,
    stopLoss: H.price * 1.005,
    takeProfit: neckline - height,
    breakoutLevel: neckline,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 76 : status === "breakout_pending" ? 62 : 48,
  };
}

export function detectInverseHeadAndShoulders(candles: HyperliquidCandle[]): DetectedPattern | null {
  if (candles.length < 80) return null;
  const win = Math.min(200, candles.length);
  const slice = candles.slice(-win);
  const { highs, lows } = findPivotHighsLows(slice, 3);
  if (lows.length < 3) return null;
  const L = lows[lows.length - 3];
  const H = lows[lows.length - 2];
  const R = lows[lows.length - 1];
  if (!(L.idx < H.idx && H.idx < R.idx)) return null;
  if (!(H.price < L.price && H.price < R.price)) return null;
  const midSh = (L.price + R.price) / 2;
  if (Math.abs(L.price - R.price) / midSh > 0.035) return null;
  const between = slice.slice(L.idx, R.idx + 1);
  const neckline = Math.max(...between.map((c) => parseFloat(c.h)));
  if (neckline <= H.price * 1.005) return null;
  const currentPrice = parseFloat(slice[slice.length - 1].c);
  let status: DetectedPattern["status"] = "forming";
  if (currentPrice > neckline * 1.003) status = "breakout_confirmed";
  else if (currentPrice > neckline) status = "breakout_pending";
  const height = neckline - H.price;
  return {
    name: "inverse_head_and_shoulders",
    displayName: "Inverse Head and Shoulders",
    status,
    entryPrice: currentPrice,
    stopLoss: H.price * 0.995,
    takeProfit: neckline + height,
    breakoutLevel: neckline,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 76 : status === "breakout_pending" ? 62 : 48,
  };
}
