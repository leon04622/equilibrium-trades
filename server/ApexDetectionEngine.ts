/**
 * Equilibrium Apex Pattern Engine — geometric heuristic (impulse pole + pivot flag).
 * Flags validate on pole + consolidation only; SMMA does not veto bear/bull geometry.
 */
import type { HyperliquidCandle } from "./hyperliquid";
import {
  calculateSMAFromCandles,
  getThresholds,
  type DetectedPattern,
} from "./sma-detection";

const POLE_LEN = 15;
const MIN_FLAG = 5;
const MAX_FLAG = 28;

/** Stricter than before: 0.24% pole moves were mostly noise; require a visible impulse + real flag channel. */
function apexThresholds(timeframe: string) {
  const scalping = timeframe === "1m" || timeframe === "3m" || timeframe === "5m";
  return {
    impulseMinPct: scalping ? 0.42 : 0.58,
    bodyRatioMin: scalping ? 0.54 : 0.6,
    maxRetrace: scalping ? 0.58 : 0.48,
    maxFlagSlopePct: scalping ? 0.38 : 0.28,
    /** Loose pivots accepted almost any two swings as a “flag” — use strict descending highs / rising lows. */
    loosePivot: false,
  };
}

function avgVolume(slice: HyperliquidCandle[]): number {
  if (slice.length === 0) return 0;
  let s = 0;
  for (const x of slice) {
    const v = parseFloat(x.v || "0");
    if (Number.isFinite(v)) s += v;
  }
  return s / slice.length;
}

function cClose(x: HyperliquidCandle): number {
  return parseFloat(x.c);
}
function cOpen(x: HyperliquidCandle): number {
  return parseFloat(x.o);
}
function cHigh(x: HyperliquidCandle): number {
  return parseFloat(x.h);
}
function cLow(x: HyperliquidCandle): number {
  return parseFloat(x.l);
}

/** Fractal pivots on a slice (indices relative to slice start). */
function findPivotsLocal(flag: HyperliquidCandle[], lookback: number) {
  const highs: { price: number; idx: number }[] = [];
  const lows: { price: number; idx: number }[] = [];
  for (let i = lookback; i < flag.length - lookback; i++) {
    const h = cHigh(flag[i]);
    const l = cLow(flag[i]);
    let isH = true;
    let isL = true;
    for (let j = 1; j <= lookback; j++) {
      if (cHigh(flag[i - j]) >= h || cHigh(flag[i + j]) >= h) isH = false;
      if (cLow(flag[i - j]) <= l || cLow(flag[i + j]) <= l) isL = false;
    }
    if (isH) highs.push({ price: h, idx: i });
    if (isL) lows.push({ price: l, idx: i });
  }
  return { highs, lows };
}

function validateBullPole(
  slice: HyperliquidCandle[],
  impulseMinPct: number,
  bodyRatioMin: number,
): { ok: boolean; movePct: number; bodyRatio: number } {
  if (slice.length !== POLE_LEN) return { ok: false, movePct: 0, bodyRatio: 0 };
  const firstC = cClose(slice[0]);
  const lastC = cClose(slice[POLE_LEN - 1]);
  const movePct = ((lastC - firstC) / Math.max(firstC, 1e-12)) * 100;
  let bullBodies = 0;
  for (const x of slice) {
    if (cClose(x) > cOpen(x)) bullBodies++;
  }
  const bodyRatio = bullBodies / POLE_LEN;
  const ok = movePct > impulseMinPct && bodyRatio >= bodyRatioMin && lastC > firstC;
  return { ok, movePct, bodyRatio };
}

function validateBearPole(
  slice: HyperliquidCandle[],
  impulseMinPct: number,
  bodyRatioMin: number,
): { ok: boolean; movePct: number; bodyRatio: number } {
  if (slice.length !== POLE_LEN) return { ok: false, movePct: 0, bodyRatio: 0 };
  const firstC = cClose(slice[0]);
  const lastC = cClose(slice[POLE_LEN - 1]);
  const movePct = ((firstC - lastC) / Math.max(firstC, 1e-12)) * 100;
  let bearBodies = 0;
  for (const x of slice) {
    if (cClose(x) < cOpen(x)) bearBodies++;
  }
  const bodyRatio = bearBodies / POLE_LEN;
  const ok = movePct > impulseMinPct && bodyRatio >= bodyRatioMin && lastC < firstC;
  return { ok, movePct, bodyRatio };
}

function poleRange(slice: HyperliquidCandle[]) {
  const hi = Math.max(...slice.map(cHigh));
  const lo = Math.min(...slice.map(cLow));
  return { poleTop: hi, poleBottom: lo, H: hi - lo };
}

function bullFlagPivotOk(flag: HyperliquidCandle[], loose: boolean): boolean {
  const { highs, lows } = findPivotsLocal(flag, 2);
  if (loose) {
    if (highs.length < 1 || lows.length < 1) return false;
    const h1 = highs[highs.length - 1]!.price;
    const l1 = lows[lows.length - 1]!.price;
    return h1 >= l1 * 0.999 && flag.length >= MIN_FLAG;
  }
  if (highs.length < 2 || lows.length < 2) return false;
  const h0 = highs[highs.length - 2].price;
  const h1 = highs[highs.length - 1].price;
  const l0 = lows[lows.length - 2].price;
  const l1 = lows[lows.length - 1].price;
  if (h1 > h0 * 1.008) return false;
  if (l1 > l0 * 1.018) return false;
  return true;
}

function bearFlagPivotOk(flag: HyperliquidCandle[], loose: boolean): boolean {
  const { highs, lows } = findPivotsLocal(flag, 2);
  if (loose) {
    if (highs.length < 1 || lows.length < 1) return false;
    const h1 = highs[highs.length - 1]!.price;
    const l1 = lows[lows.length - 1]!.price;
    return l1 <= h1 * 1.001 && flag.length >= MIN_FLAG;
  }
  if (highs.length < 2 || lows.length < 2) return false;
  const h0 = highs[highs.length - 2].price;
  const h1 = highs[highs.length - 1].price;
  const l0 = lows[lows.length - 2].price;
  const l1 = lows[lows.length - 1].price;
  if (l1 < l0 * 0.992) return false;
  if (l1 < l0 * 0.995) return false;
  if (h1 < h0 * 0.985) return false;
  return true;
}

function buildBullFlag(
  pole: HyperliquidCandle[],
  flag: HyperliquidCandle[],
  tail: HyperliquidCandle[],
  timeframe: string,
): DetectedPattern | null {
  const thresholds = getThresholds(timeframe);
  const { poleTop, poleBottom, H } = poleRange(pole);
  if (H <= 0) return null;
  const flagHi = Math.max(...flag.map(cHigh));
  const flagLo = Math.min(...flag.map(cLow));
  const flagRange = flagHi - flagLo;
  const currentPrice = cClose(tail[tail.length - 1]);
  let status: DetectedPattern["status"] = "forming";
  const recentHigh = Math.max(...tail.map(cHigh));
  const breakoutPct = ((recentHigh - flagHi) / Math.max(flagHi, 1e-12)) * 100;
  if (breakoutPct > thresholds.minBreakoutPercent) status = "breakout_confirmed";
  else if (currentPrice > flagHi) status = "breakout_pending";

  const entryPrice = status === "breakout_confirmed" ? currentPrice : flagHi;
  let takeProfit = flagHi + H;
  if (takeProfit <= entryPrice) takeProfit = entryPrice + H;

  return {
    name: "bull_flag",
    displayName: "Bull Flag (Apex)",
    status,
    entryPrice,
    stopLoss: flagLo - flagRange * 0.1,
    takeProfit,
    breakoutLevel: flagHi,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 86 : status === "breakout_pending" ? 72 : 48,
  };
}

function buildBearFlag(
  pole: HyperliquidCandle[],
  flag: HyperliquidCandle[],
  tail: HyperliquidCandle[],
  timeframe: string,
): DetectedPattern | null {
  const thresholds = getThresholds(timeframe);
  const { poleTop, poleBottom, H } = poleRange(pole);
  if (H <= 0) return null;
  const flagHi = Math.max(...flag.map(cHigh));
  const flagLo = Math.min(...flag.map(cLow));
  const flagRange = flagHi - flagLo;
  const currentPrice = cClose(tail[tail.length - 1]);
  let status: DetectedPattern["status"] = "forming";
  const recentLow = Math.min(...tail.map(cLow));
  const breakoutPct = ((flagLo - recentLow) / Math.max(flagLo, 1e-12)) * 100;
  if (breakoutPct > thresholds.minBreakoutPercent) status = "breakout_confirmed";
  else if (currentPrice < flagLo) status = "breakout_pending";

  const entryPrice = status === "breakout_confirmed" ? currentPrice : flagLo;
  let takeProfit = flagLo - H;
  if (takeProfit >= entryPrice) takeProfit = entryPrice - H;

  return {
    name: "bear_flag",
    displayName: "Bear Flag (Apex)",
    status,
    entryPrice,
    stopLoss: flagHi + flagRange * 0.1,
    takeProfit,
    breakoutLevel: flagLo,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 86 : status === "breakout_pending" ? 72 : 48,
  };
}

export type ApexScanState = "no_pattern" | "ranging" | "bull_flag" | "bear_flag";

export interface ApexGeometricResult {
  pattern: DetectedPattern | null;
  scanState: ApexScanState;
  note: string;
  poleMovePct?: number;
  poleBodyRatio?: number;
  retraceRatio?: number;
  /** True when flag-period volume is not inflated vs pole (classic bull/bear flag textbook). */
  volumeOk?: boolean;
}

/**
 * Impulse-first bull/bear flag: 15-bar pole + pivot flag + retrace cap; **1m/3m/5m use aggressive** thresholds
 * (momentum + tight flag). SMMA is **not** used to suppress opposite-direction flags — geometry only.
 */
export function runApexGeometricFlagScan(candles: HyperliquidCandle[], timeframe: string): ApexGeometricResult {
  try {
    if (candles.length < POLE_LEN + MIN_FLAG + 4) {
      return { pattern: null, scanState: "no_pattern", note: "Insufficient history for pole + flag." };
    }

    const apx = apexThresholds(timeframe);

    let best: {
      pat: DetectedPattern;
      score: number;
      note: string;
      state: ApexScanState;
      poleMove: number;
      bodyR: number;
      retr: number;
      volumeOk: boolean;
    } | null = null;

    const len = candles.length;
    const poleEndMin = Math.max(POLE_LEN, len - 72);
    for (let flagLen = MAX_FLAG; flagLen >= MIN_FLAG; flagLen--) {
      for (let poleEnd = len - 2; poleEnd >= poleEndMin; poleEnd--) {
        if (poleEnd + flagLen >= len) continue;
        const pole = candles.slice(poleEnd - POLE_LEN, poleEnd);
        const flag = candles.slice(poleEnd, poleEnd + flagLen);
        const tail = candles.slice(poleEnd + flagLen);
        if (tail.length < 1) continue;

        const { poleTop, poleBottom, H } = poleRange(pole);
        if (H <= 0) continue;

        const bullPole = validateBullPole(pole, apx.impulseMinPct, apx.bodyRatioMin);
        if (bullPole.ok) {
          const flagLo = Math.min(...flag.map(cLow));
          const flagHi = Math.max(...flag.map(cHigh));
          const retrace = (poleTop - flagLo) / H;
          if (retrace > apx.maxRetrace) continue;
          if (flagLo < poleBottom * 0.9985) continue;
          if (!bullFlagPivotOk(flag, apx.loosePivot)) continue;
          const firstFC = cClose(flag[0]);
          const lastFC = cClose(flag[flag.length - 1]);
          if (((lastFC - firstFC) / Math.max(firstFC, 1e-12)) * 100 > apx.maxFlagSlopePct) continue;

          const pat = buildBullFlag(pole, flag, tail, timeframe);
          if (!pat) continue;
          const vPole = avgVolume(pole);
          const vFlag = avgVolume(flag);
          const volumeOk = vPole > 0 ? vFlag < vPole * 1.1 : false;
          const score =
            pat.confidence +
            (retrace < 0.35 ? 12 : 0) +
            (bullPole.bodyRatio >= 0.8 ? 5 : 0) +
            (volumeOk ? 6 : 0);
          const note = `Pole +${bullPole.movePct.toFixed(2)}% (${(bullPole.bodyRatio * 100).toFixed(0)}% bull bodies); retrace ${(retrace * 100).toFixed(0)}% of pole; pivot channel OK.${volumeOk ? " Flag vol ≤ pole." : ""}`;
          if (!best || score > best.score) {
            best = {
              pat,
              score,
              note,
              state: "bull_flag",
              poleMove: bullPole.movePct,
              bodyR: bullPole.bodyRatio,
              retr: retrace,
              volumeOk,
            };
          }
        }

        const bearPole = validateBearPole(pole, apx.impulseMinPct, apx.bodyRatioMin);
        if (bearPole.ok) {
          const flagLo = Math.min(...flag.map(cLow));
          const flagHi = Math.max(...flag.map(cHigh));
          const retrace = (flagHi - poleBottom) / H;
          if (retrace > apx.maxRetrace) continue;
          if (flagHi > poleTop * 1.0015) continue;
          if (!bearFlagPivotOk(flag, apx.loosePivot)) continue;
          const firstFC = cClose(flag[0]);
          const lastFC = cClose(flag[flag.length - 1]);
          if (((lastFC - firstFC) / Math.max(firstFC, 1e-12)) * 100 < -apx.maxFlagSlopePct) continue;

          const pat = buildBearFlag(pole, flag, tail, timeframe);
          if (!pat) continue;
          const vPole = avgVolume(pole);
          const vFlag = avgVolume(flag);
          const volumeOk = vPole > 0 ? vFlag < vPole * 1.1 : false;
          const score =
            pat.confidence +
            (retrace < 0.35 ? 12 : 0) +
            (bearPole.bodyRatio >= 0.8 ? 5 : 0) +
            (volumeOk ? 6 : 0);
          const note = `Pole −${bearPole.movePct.toFixed(2)}% (${(bearPole.bodyRatio * 100).toFixed(0)}% bear bodies); retrace ${(retrace * 100).toFixed(0)}% of pole; pivot channel OK.${volumeOk ? " Flag vol ≤ pole." : ""}`;
          if (!best || score > best.score) {
            best = {
              pat,
              score,
              note,
              state: "bear_flag",
              poleMove: bearPole.movePct,
              bodyR: bearPole.bodyRatio,
              retr: retrace,
              volumeOk,
            };
          }
        }
      }
    }

    if (best) {
      return {
        pattern: best.pat,
        scanState: best.state,
        note: best.note,
        poleMovePct: best.poleMove,
        poleBodyRatio: best.bodyR,
        retraceRatio: best.retr,
        volumeOk: best.volumeOk,
      };
    }

    const recent = candles.slice(-20);
    const mid = cClose(recent[recent.length - 1]);
    const rng = Math.max(...recent.map(cHigh)) - Math.min(...recent.map(cLow));
    if (mid > 0 && rng / mid < 0.007) {
      return {
        pattern: null,
        scanState: "ranging",
        note: "No verified impulse pole — compression / Ranging.",
      };
    }
    return {
      pattern: null,
      scanState: "no_pattern",
      note: "No Apex flag — pole or pivot geometry failed validation.",
    };
  } catch (e) {
    return {
      pattern: null,
      scanState: "no_pattern",
      note: `Apex scan error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** 15m SMMA trend bullish — used for 1m high-probability confluence. */
export function is15mTrendBullish(mtf: Record<string, HyperliquidCandle[] | undefined>): boolean {
  const c15 = mtf["15m"];
  if (!c15 || c15.length < 200) return false;
  const s = calculateSMAFromCandles(c15);
  return !!s && s.sma21 > s.sma200 * 1.0001;
}

export function is15mTrendBearish(mtf: Record<string, HyperliquidCandle[] | undefined>): boolean {
  const c15 = mtf["15m"];
  if (!c15 || c15.length < 200) return false;
  const s = calculateSMAFromCandles(c15);
  return !!s && s.sma21 < s.sma200 * 0.9999;
}
