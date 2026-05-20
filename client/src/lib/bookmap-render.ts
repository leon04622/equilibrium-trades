import type { HeatmapCell, HeatmapGridMeta, HeatmapTrade } from "@shared/heatmap-grid";

/** Layout pads — heatmap center, price axis + SVP on the right (Bookmap layout). */
export const BOOKMAP_PAD = {
  left: 6,
  top: 4,
  bottom: 22,
  cob: 24,
  priceAxis: 52,
  svp: 44,
} as const;

/** Right edge of the liquidity heat (before COB / price / SVP). */
export function plotRightEdge(width: number): number {
  return width - BOOKMAP_PAD.priceAxis - BOOKMAP_PAD.svp - BOOKMAP_PAD.cob;
}

export function priceToY(
  price: number,
  meta: HeatmapGridMeta,
  height: number,
): number {
  const plotH =
    height - BOOKMAP_PAD.top - BOOKMAP_PAD.bottom;
  const ratio = (price - meta.minPrice) / (meta.maxPrice - meta.minPrice);
  return BOOKMAP_PAD.top + plotH * (1 - Math.max(0, Math.min(1, ratio)));
}

export function timeToX(
  time: number,
  minTime: number,
  maxTime: number,
  width: number,
): number {
  const plotW = plotRightEdge(width) - BOOKMAP_PAD.left;
  if (maxTime <= minTime) return BOOKMAP_PAD.left + plotW;
  const ratio = (time - minTime) / (maxTime - minTime);
  return BOOKMAP_PAD.left + ratio * plotW;
}

/** Bookmap heat scale: dark blue → cyan → yellow → red */
export function bookmapHeatColor(intensity: number): string | null {
  if (intensity < 0.02) return null;
  const t = Math.min(1, Math.pow(intensity, 0.4));

  let r: number;
  let g: number;
  let b: number;
  let a: number;

  if (t < 0.18) {
    const u = t / 0.18;
    r = 8 + u * 6;
    g = 18 + u * 90;
    b = 38 + u * 110;
    a = 0.25 + u * 0.25;
  } else if (t < 0.42) {
    const u = (t - 0.18) / 0.24;
    r = 14 + u * 30;
    g = 108 + u * 110;
    b = 148 - u * 30;
    a = 0.5 + u * 0.2;
  } else if (t < 0.68) {
    const u = (t - 0.42) / 0.26;
    r = 44 + u * 190;
    g = 218 - u * 30;
    b = 118 - u * 90;
    a = 0.7 + u * 0.12;
  } else {
    const u = (t - 0.68) / 0.32;
    r = 234 + u * 21;
    g = 188 - u * 130;
    b = 28 - u * 8;
    a = 0.82 + u * 0.15;
  }

  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export type VolumeProfile = {
  buy: number[];
  sell: number[];
};

/** Session volume at price (SVP) from executed trades in the visible window. */
export function buildSessionVolumeProfile(
  trades: HeatmapTrade[],
  meta: HeatmapGridMeta,
  minTime: number,
  maxTime: number,
): VolumeProfile {
  const bins = meta.priceBins;
  const buy = new Array(bins).fill(0);
  const sell = new Array(bins).fill(0);

  for (const t of trades) {
    if (t.timestamp < minTime || t.timestamp > maxTime) continue;
    if (t.price < meta.minPrice || t.price > meta.maxPrice) continue;
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor((t.price - meta.minPrice) / meta.binSize)),
    );
    if (t.side === "bid") buy[idx] += t.size;
    else sell[idx] += t.size;
  }

  return { buy, sell };
}

export function maxHeatmapVolume(columns: HeatmapCell[][]): number {
  let max = 0;
  for (const col of columns) {
    for (const cell of col) {
      max = Math.max(max, cell.totalVolume ?? cell.bidVolume + cell.askVolume);
    }
  }
  return max;
}
