/** Merge and repair Hyperliquid OHLC series so the chart has no time gaps. */

export type ChartCandle = {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v: number | string;
};

export const CHART_INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

function toNum(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** HL `t` is ms; guard cached rows stored with wrong magnitude. */
export function normalizeCandleTimeMs(t: number, interval: string): number {
  if (!Number.isFinite(t)) return t;
  const step = CHART_INTERVAL_MS[interval] ?? 60_000;
  let ms = t;
  if (ms < 1e12) ms *= 1000;
  return Math.floor(ms / step) * step;
}

function mergeOhlcBar(a: ChartCandle, b: ChartCandle): ChartCandle {
  return {
    t: a.t,
    o: a.o,
    h: Math.max(toNum(a.h), toNum(b.h)),
    l: Math.min(toNum(a.l), toNum(b.l)),
    c: b.c,
    v: b.v,
  };
}

/** Union two snapshots by bar time; keeps best highs/lows and latest close. */
export function mergeCandleSnapshots(
  base: ChartCandle[],
  incoming: ChartCandle[],
  interval: string,
): ChartCandle[] {
  const byTime = new Map<number, ChartCandle>();
  for (const raw of base) {
    if (!Number.isFinite(raw.t)) continue;
    const t = normalizeCandleTimeMs(raw.t, interval);
    byTime.set(t, { ...raw, t });
  }
  for (const raw of incoming) {
    if (!Number.isFinite(raw.t)) continue;
    const t = normalizeCandleTimeMs(raw.t, interval);
    const prev = byTime.get(t);
    byTime.set(t, prev ? mergeOhlcBar(prev, { ...raw, t }) : { ...raw, t });
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function countTimeGaps(candles: ChartCandle[], interval: string): number {
  const step = CHART_INTERVAL_MS[interval];
  if (!step || candles.length < 2) return 0;
  let gaps = 0;
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i]!.t - candles[i - 1]!.t;
    if (delta > step * 1.5) gaps++;
  }
  return gaps;
}

/** Max synthetic flat bars per gap — avoids huge flat stretches that make the chart look broken. */
const MAX_SYNTHETIC_BARS_PER_GAP = 6;

/** Insert flat bars for missing intervals (HL sometimes omits zero-volume bars). */
export function fillMissingCandles(candles: ChartCandle[], interval: string): ChartCandle[] {
  const step = CHART_INTERVAL_MS[interval];
  if (!step || candles.length < 2) return candles;

  const out: ChartCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i]!;
    out.push(cur);
    if (i >= candles.length - 1) break;
    const next = candles[i + 1]!;
    let t = cur.t + step;
    const close = cur.c;
    let synthetic = 0;
    while (t < next.t - step * 0.5 && synthetic < MAX_SYNTHETIC_BARS_PER_GAP) {
      out.push({ t, o: close, h: close, l: close, c: close, v: 0 });
      t += step;
      synthetic++;
    }
  }
  return out;
}

/** True when series length and last bar time are unchanged (forming bar wick/close updates only). */
export function isFormingBarUpdate(
  prevLen: number,
  prevLastTimeMs: number,
  candles: ChartCandle[],
  interval: string,
): boolean {
  if (candles.length === 0 || candles.length !== prevLen) return false;
  const last = candles[candles.length - 1]!;
  if (last.t !== prevLastTimeMs) return false;
  return countTimeGaps(candles, interval) === 0;
}

export function repairCandleSeries(candles: ChartCandle[], interval: string): ChartCandle[] {
  const merged = mergeCandleSnapshots([], candles, interval);
  return fillMissingCandles(merged, interval);
}

export function fingerprintCandleSeries(candles: ChartCandle[], interval: string): string {
  if (candles.length === 0) return "empty";
  const gaps = countTimeGaps(candles, interval);
  const tail = candles.slice(-3);
  const tailKey = tail.map((c) => `${c.t}:${c.o}:${c.h}:${c.l}:${c.c}`).join("|");
  return `${candles.length}:g${gaps}:${tailKey}`;
}
