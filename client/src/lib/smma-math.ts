import type { Time } from "lightweight-charts";

/** SMMA (Smoothed Moving Average) — matches native venue chart math; do not change formula. */
export function calcSMMA(
  vals: number[],
  times: Time[],
  period: number,
): { time: Time; value: number }[] {
  if (vals.length < period) return [];
  const out: { time: Time; value: number }[] = [];
  let prev = 0;
  for (let i = 0; i < period; i++) prev += vals[i];
  prev /= period;
  out.push({ time: times[period - 1], value: prev });
  for (let i = period; i < vals.length; i++) {
    const smma = (prev * (period - 1) + vals[i]) / period;
    out.push({ time: times[i], value: smma });
    prev = smma;
  }
  return out;
}
