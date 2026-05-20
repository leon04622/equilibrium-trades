import type { Time } from "lightweight-charts";

/** Hyperliquid / LW chart: candle `t` is ms; series time is Unix seconds. */
export function lightweightTimeToSeconds(time: Time): number | null {
  if (typeof time === "number" && Number.isFinite(time)) return time;
  if (typeof time === "string") {
    const n = parseInt(time, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof time === "object" && time !== null && "year" in time) {
    const d = time as { year: number; month: number; day: number };
    return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 1000);
  }
  return null;
}

/** Right price-scale gutter (matches apex-sovereign HL_GUTTER). */
export const CHART_PRICE_SCALE_GUTTER = 72;
