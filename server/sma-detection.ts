// SMA Crossover & Pattern Detection System
// Based on the 21/200 SMA Crossover Strategy from cryptolifer.com
// 
// PATTERNS DETECTED:
// Continuation: Bull Flag, Bear Flag, Pennant, Ascending/Descending/Symmetrical Triangles
// Reversal: Double Top/Bottom, Head & Shoulders, Wedges
//
// METHODOLOGY:
// 1. Determine bias: 21 SMA > 200 SMA = bullish, 21 SMA < 200 SMA = bearish
// 2. Identify pattern formation
// 3. Wait for BREAKOUT confirmation
// 4. ONLY signal entry after breakout is confirmed

import pLimit from "p-limit";
import { getCandles, HyperliquidCandle } from "./hyperliquid";

const DEFAULT_SCAN_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];

export interface SMAValues {
  sma21: number;
  sma200: number;
  price: number;
  timestamp: number;
}

export type PatternName = 
  | "bull_flag" | "bear_flag" 
  | "bullish_pennant" | "bearish_pennant"
  | "ascending_triangle" | "descending_triangle" | "symmetrical_triangle"
  | "double_bottom" | "double_top"
  | "rising_wedge" | "falling_wedge"
  | "cup_and_handle"
  | "head_and_shoulders" | "inverse_head_and_shoulders";

export interface DetectedPattern {
  name: PatternName;
  displayName: string;
  status: "forming" | "breakout_pending" | "breakout_confirmed";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  breakoutLevel: number;
  currentPrice: number;
  confidence: number;
}

export interface CrossoverSignal {
  id: string;
  coin: string;
  type: "bullish_crossover" | "bearish_crossover" | "bullish_setup" | "bearish_setup";
  status: "forming" | "confirmed" | "active" | "breakout";
  timeframe: string;
  sma21: number;
  sma200: number;
  currentPrice: number;
  entryPrice: number;
  suggestedSL: number;
  suggestedTP: number;
  confidence: number;
  detectedAt: Date;
  description: string;
  patternType?: string;
}

// Timeframe-specific thresholds (minMovePercent = minimum pole size vs price; slightly looser on 1m–5m for real flags)
export function getThresholds(timeframe: string) {
  const thresholds: Record<string, { minMovePercent: number; minBreakoutPercent: number; lookback: number }> = {
    // 1m is noisy — keep rules meaningful but slightly looser so the scanner isn’t empty every pass.
    "1m":  { minMovePercent: 0.06, minBreakoutPercent: 0.028, lookback: 30 },
    "3m":  { minMovePercent: 0.14, minBreakoutPercent: 0.05, lookback: 32 },
    "5m":  { minMovePercent: 0.18, minBreakoutPercent: 0.06, lookback: 35 },
    "15m": { minMovePercent: 0.20, minBreakoutPercent: 0.07, lookback: 40 },
    "30m": { minMovePercent: 0.24, minBreakoutPercent: 0.08, lookback: 45 },
    "1h":  { minMovePercent: 0.28, minBreakoutPercent: 0.10, lookback: 50 },
    "2h":  { minMovePercent: 0.34, minBreakoutPercent: 0.12, lookback: 50 },
    "4h":  { minMovePercent: 0.42, minBreakoutPercent: 0.14, lookback: 50 },
    "1d":  { minMovePercent: 0.55, minBreakoutPercent: 0.18, lookback: 50 },
  };
  return thresholds[timeframe] || thresholds["1h"];
}

/** Only these TFs use looser flag geometry (noise on 1m–5m). Was incorrectly set to *all* TFs, which made 4h/1d use scalping tolerances and produced many false bull/bear flags. */
const SHORT_SCAN_TFS = new Set(["1m", "3m", "5m"]);

/** Breakouts / pending formations rank above “forming only”; then higher confidence. */
export function sortPatternCandidatesByActionability(patterns: DetectedPattern[]): void {
  patterns.sort((a, b) => {
    const tier = (p: DetectedPattern) =>
      p.status === "breakout_confirmed" ? 3 : p.status === "breakout_pending" ? 2 : 1;
    const d = tier(b) - tier(a);
    if (d !== 0) return d;
    return b.confidence - a.confidence;
  });
}

export function patternsLooselyEqual(a: DetectedPattern, b: DetectedPattern): boolean {
  return (
    a.name === b.name &&
    Math.abs(a.entryPrice - b.entryPrice) / Math.max(Math.abs(a.entryPrice), 1e-12) < 0.003
  );
}

function flagPatternScore(p: DetectedPattern): number {
  const tier = p.status === "breakout_confirmed" ? 300 : p.status === "breakout_pending" ? 200 : 100;
  return tier + p.confidence;
}

function patternActionabilityScore(p: DetectedPattern): number {
  const tier = p.status === "breakout_confirmed" ? 300 : p.status === "breakout_pending" ? 200 : 100;
  return tier + p.confidence;
}

/**
 * Scans sliding windows; returns the best-matching pattern plus, when the best is already
 * breaking out, a stronger **forming** instance from another offset so the scanner surfaces
 * developing setups (not only completed breaks).
 */
function scanPatternWindows(
  candles: HyperliquidCandle[],
  windowSizes: number[],
  maxOffset: number,
  step: number,
  detector: (window: HyperliquidCandle[]) => DetectedPattern | null,
): DetectedPattern[] {
  let best: DetectedPattern | null = null;
  let bestScore = -Infinity;
  let bestForming: DetectedPattern | null = null;
  let bestFormingScore = -Infinity;

  for (const windowSize of windowSizes) {
    if (candles.length < windowSize) continue;
    const cappedOffset = Math.max(0, Math.min(candles.length - windowSize, maxOffset));
    for (let offset = 0; offset <= cappedOffset; offset += step) {
      const end = candles.length - offset;
      const start = end - windowSize;
      if (start < 0) continue;
      const pattern = detector(candles.slice(start, end));
      if (!pattern) continue;
      const score = patternActionabilityScore(pattern);
      if (score > bestScore) {
        bestScore = score;
        best = pattern;
      }
      if (pattern.status === "forming") {
        const fScore = pattern.confidence;
        if (fScore > bestFormingScore) {
          bestFormingScore = fScore;
          bestForming = pattern;
        }
      }
    }
  }

  if (!best) return [];
  if (best.status === "forming") return [best];
  if (bestForming && !patternsLooselyEqual(best, bestForming)) {
    return [bestForming, best];
  }
  return [best];
}

// SMMA (Smoothed Moving Average) — matches Hyperliquid exactly
// First value = SMA of first `period` bars; then SMMA = (prev * (period-1) + close) / period
function calculateSMMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  let smma = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    smma = (smma * (period - 1) + prices[i]) / period;
  }
  return smma;
}

export function calculateSMAFromCandles(candles: HyperliquidCandle[]): SMAValues | null {
  if (candles.length < 200) return null;
  
  const closePrices = candles.map(c => parseFloat(c.c));
  const sma21 = calculateSMMA(closePrices, 21);
  const sma200 = calculateSMMA(closePrices, 200);
  const lastCandle = candles[candles.length - 1];
  
  if (!sma21 || !sma200) return null;
  
  return {
    sma21,
    sma200,
    price: parseFloat(lastCandle.c),
    timestamp: lastCandle.t,
  };
}

// Find swing highs and lows
function findSwingPoints(candles: HyperliquidCandle[], lookback: number = 5): { highs: { price: number; idx: number }[]; lows: { price: number; idx: number }[] } {
  const highs: { price: number; idx: number }[] = [];
  const lows: { price: number; idx: number }[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = parseFloat(candles[i].h);
    const currentLow = parseFloat(candles[i].l);
    
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = 1; j <= lookback; j++) {
      if (parseFloat(candles[i - j].h) >= currentHigh || parseFloat(candles[i + j].h) >= currentHigh) {
        isSwingHigh = false;
      }
      if (parseFloat(candles[i - j].l) <= currentLow || parseFloat(candles[i + j].l) <= currentLow) {
        isSwingLow = false;
      }
    }
    
    if (isSwingHigh) highs.push({ price: currentHigh, idx: i });
    if (isSwingLow) lows.push({ price: currentLow, idx: i });
  }
  
  return { highs, lows };
}

// Detect Bull/Bear Flag patterns on a fixed 60-candle window
//   Candles  0-25: POLE (sharp impulse)
//   Candles 25-50: FLAG consolidation (counter-slope to pole)
//   Candles 50-59: breakout zone vs flag boundary
function detectFlagPatternInFixedWindow(
  window: HyperliquidCandle[],
  isBullish: boolean,
  timeframe: string,
): DetectedPattern | null {
  const thresholds = getThresholds(timeframe);
  if (window.length < 60) return null;

  const shortTf = SHORT_SCAN_TFS.has(timeframe);
  /** 1m/3m/5m: still need a real pole + counter-slope flag; higher TFs use stricter ratios. */
  const maxFlagToPoleRatio = shortTf ? 0.78 : 0.58;
  const maxPoleRetraceRatio = shortTf ? 0.68 : 0.52;
  const poleMinMult = shortTf ? 0.82 : 1;
  const bullFlagMaxUpSlope = shortTf ? 0.32 : 0.22;
  const bearFlagMinSlope = shortTf ? -0.38 : -0.22;

  const poleCandles = window.slice(0, 25);
  const flagCandles = window.slice(25, 50);
  const recentCandles = window.slice(50);

  const currentPrice = parseFloat(window[window.length - 1].c);

  if (isBullish) {
    // ── POLE: sharp upward move ──────────────────────────────────────────────
    const poleHighPrices = poleCandles.map(c => parseFloat(c.h));
    const poleLowPrices  = poleCandles.map(c => parseFloat(c.l));
    const poleBottom     = Math.min(...poleLowPrices);
    const poleTop        = Math.max(...poleHighPrices);
    const poleHeight     = poleTop - poleBottom;
    const poleHeightPct  = (poleHeight / poleBottom) * 100;

    if (poleHeightPct < thresholds.minMovePercent * poleMinMult) return null;
    // Pole must end ABOVE where it started (genuinely bullish impulse)
    if (poleTop <= poleBottom) return null;

    // ── FLAG: tight downward-sloping consolidation after the pole ────────────
    const flagHighs = flagCandles.map(c => parseFloat(c.h));
    const flagLows  = flagCandles.map(c => parseFloat(c.l));
    const flagUpperBound = Math.max(...flagHighs);
    const flagLowerBound = Math.min(...flagLows);
    const flagRange = flagUpperBound - flagLowerBound;

    if (flagRange / poleHeight > maxFlagToPoleRatio) return null;

    const retraceFromTop = poleTop - flagLowerBound;
    if (retraceFromTop / poleHeight > maxPoleRetraceRatio) return null;

    // Flag must stay ABOVE the pole's base (not give back the whole move)
    if (flagLowerBound < poleBottom) return null;

    // Flag should slope downward (counter to the pole) — check using first vs last flag candles
    const firstFlagClose = parseFloat(flagCandles[0].c);
    const lastFlagClose  = parseFloat(flagCandles[flagCandles.length - 1].c);
    // Allow neutral flags (flat) too, but reject upward-sloping flags
    const flagSlopePct = ((lastFlagClose - firstFlagClose) / firstFlagClose) * 100;
    if (flagSlopePct > bullFlagMaxUpSlope) return null;

    // ── BREAKOUT: current price vs flag upper boundary ────────────────────────
    let status: DetectedPattern["status"] = "forming";
    const recentHigh = Math.max(...recentCandles.map(c => parseFloat(c.h)));
    const breakoutPct = ((recentHigh - flagUpperBound) / flagUpperBound) * 100;
    if (breakoutPct > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice > flagUpperBound) {
      status = "breakout_pending";
    }

    const entryPrice = status === "breakout_confirmed" ? currentPrice : flagUpperBound;
    let takeProfit = flagUpperBound + poleHeight;
    if (takeProfit <= entryPrice) takeProfit = entryPrice + poleHeight;

    return {
      name: "bull_flag",
      displayName: "Bull Flag",
      status,
      entryPrice,
      stopLoss: flagLowerBound - flagRange * 0.1,
      takeProfit,
      breakoutLevel: flagUpperBound,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 80 : status === "breakout_pending" ? 65 : 44,
    };

  } else {
    // ── POLE: sharp downward move ─────────────────────────────────────────────
    const poleHighPrices = poleCandles.map(c => parseFloat(c.h));
    const poleLowPrices  = poleCandles.map(c => parseFloat(c.l));
    const poleTop        = Math.max(...poleHighPrices);
    const poleBottom     = Math.min(...poleLowPrices);
    const poleHeight     = poleTop - poleBottom;
    const poleHeightPct  = (poleHeight / poleTop) * 100;

    if (poleHeightPct < thresholds.minMovePercent * poleMinMult) return null;
    if (poleBottom >= poleTop) return null;

    // ── FLAG: tight upward-sloping consolidation after the pole ──────────────
    const flagHighs = flagCandles.map(c => parseFloat(c.h));
    const flagLows  = flagCandles.map(c => parseFloat(c.l));
    const flagUpperBound = Math.max(...flagHighs);
    const flagLowerBound = Math.min(...flagLows);
    const flagRange = flagUpperBound - flagLowerBound;

    if (flagRange / poleHeight > maxFlagToPoleRatio) return null;

    const retraceFromBottom = flagUpperBound - poleBottom;
    if (retraceFromBottom / poleHeight > maxPoleRetraceRatio) return null;

    // Flag must stay BELOW the pole's peak
    if (flagUpperBound > poleTop) return null;

    // Flag should slope upward (counter to the pole) — reject downward-sloping flags
    const firstFlagClose = parseFloat(flagCandles[0].c);
    const lastFlagClose  = parseFloat(flagCandles[flagCandles.length - 1].c);
    const flagSlopePct = ((lastFlagClose - firstFlagClose) / firstFlagClose) * 100;
    if (flagSlopePct < bearFlagMinSlope) return null;

    // ── BREAKOUT: current price vs flag lower boundary ────────────────────────
    let status: DetectedPattern["status"] = "forming";
    const recentLow = Math.min(...recentCandles.map(c => parseFloat(c.l)));
    const breakoutPct = ((flagLowerBound - recentLow) / flagLowerBound) * 100;
    if (breakoutPct > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice < flagLowerBound) {
      status = "breakout_pending";
    }

    const entryPrice = status === "breakout_confirmed" ? currentPrice : flagLowerBound;
    let takeProfit = flagLowerBound - poleHeight;
    if (takeProfit >= entryPrice) takeProfit = entryPrice - poleHeight;

    return {
      name: "bear_flag",
      displayName: "Bear Flag",
      status,
      entryPrice,
      stopLoss: flagUpperBound + flagRange * 0.1,
      takeProfit,
      breakoutLevel: flagLowerBound,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 80 : status === "breakout_pending" ? 65 : 44,
    };
  }
}

/**
 * Try several alignments of the 60-bar template. A fixed slice(-60) often misses when the pole
 * ended a few bars earlier on 1m–5m charts.
 */
/** Same as sliding-window triangle/wedge logic: keep a forming offset when a higher-scoring breakout exists. */
function detectFlagPatterns(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern[] {
  if (candles.length < 60) return [];
  const maxOffset = Math.max(0, Math.min(candles.length - 60, 72));
  const offsets: number[] = [];
  for (let offset = 0; offset <= maxOffset; offset += 2) {
    offsets.push(offset);
  }
  let best: DetectedPattern | null = null;
  let bestScore = -1;
  let bestForming: DetectedPattern | null = null;
  let bestFormingConf = -1;
  for (const o of offsets) {
    if (candles.length < 60 + o) continue;
    const window = candles.slice(candles.length - 60 - o, candles.length - o);
    const p = detectFlagPatternInFixedWindow(window, isBullish, timeframe);
    if (!p) continue;
    const sc = flagPatternScore(p);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
    if (p.status === "forming" && p.confidence > bestFormingConf) {
      bestFormingConf = p.confidence;
      bestForming = p;
    }
  }
  if (!best) return [];
  if (best.status === "forming") return [best];
  if (bestForming && !patternsLooselyEqual(best, bestForming)) {
    return [bestForming, best];
  }
  return [best];
}

// Detect Triangle patterns (Ascending, Descending, Symmetrical)
function detectTrianglePatternInWindow(
  recentCandles: HyperliquidCandle[],
  isBullish: boolean,
  timeframe: string,
): DetectedPattern | null {
  if (recentCandles.length < 40) return null;

  const thresholds = getThresholds(timeframe);
  const { highs, lows } = findSwingPoints(recentCandles, 3);

  if (highs.length < 2 || lows.length < 2) return null;

  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  if (recentHighs.length < 2 || recentLows.length < 2) return null;

  const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
  const avgPrice = currentPrice;

  // Normalize slopes as % of price per candle so thresholds work on any asset price
  const rawHighSlope = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / (recentHighs[recentHighs.length - 1].idx - recentHighs[0].idx || 1);
  const rawLowSlope = (recentLows[recentLows.length - 1].price - recentLows[0].price) / (recentLows[recentLows.length - 1].idx - recentLows[0].idx || 1);

  // Slopes as % of price per candle — price-relative so they work for BTC, altcoins, etc.
  const highSlopePct = rawHighSlope / avgPrice; // e.g. -0.0003 = falling 0.03% per candle
  const lowSlopePct = rawLowSlope / avgPrice;

  // Give broader BTC / majors a little more room while keeping clear convergence.
  const flatThreshold =
    timeframe === "1m" || timeframe === "3m" || timeframe === "5m" ? 0.00045 : 0.00035;
  const isHighFlat = Math.abs(highSlopePct) < flatThreshold;
  const isLowFlat = Math.abs(lowSlopePct) < flatThreshold;
  const isHighFalling = highSlopePct < -flatThreshold;
  const isLowRising = lowSlopePct > flatThreshold;

  const resistance = recentHighs[recentHighs.length - 1].price;
  const support = recentLows[recentLows.length - 1].price;
  const range = resistance - support;

  // Range must be meaningful relative to price
  if ((range / avgPrice) * 100 < thresholds.minMovePercent) return null;

  // Lines must be converging (not already crossed)
  if (resistance <= support) return null;

  let patternName: PatternName | null = null;
  let displayName = "";

  // Ascending Triangle: flat resistance, rising support
  if (isHighFlat && isLowRising) {
    patternName = "ascending_triangle";
    displayName = "Ascending Triangle";
  }
  // Descending Triangle: falling resistance, flat support
  else if (isHighFalling && isLowFlat) {
    patternName = "descending_triangle";
    displayName = "Descending Triangle";
  }
  // Symmetrical Triangle: both lines converging (falling highs, rising lows)
  else if (isHighFalling && isLowRising) {
    patternName = "symmetrical_triangle";
    displayName = "Symmetrical Triangle";
  }

  if (!patternName) return null;

  let status: DetectedPattern["status"] = "forming";
  let breakoutLevel: number;
  let stopLoss: number;
  let takeProfit: number;
  let entryPrice: number;

  if (isBullish && (patternName === "ascending_triangle" || patternName === "symmetrical_triangle")) {
    breakoutLevel = resistance;
    // Use recent 5-candle high to catch a confirmed breakout that closed above
    const recentHigh = Math.max(...recentCandles.slice(-5).map(c => parseFloat(c.h)));
    const breakoutPercent = ((recentHigh - resistance) / resistance) * 100;
    if (breakoutPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice > resistance) {
      status = "breakout_pending";
    }
    entryPrice = status === "breakout_confirmed" ? currentPrice : breakoutLevel;
    stopLoss = support - (range * 0.1);
    takeProfit = resistance + range;
    if (takeProfit <= entryPrice) takeProfit = entryPrice + range;
  } else if (!isBullish && (patternName === "descending_triangle" || patternName === "symmetrical_triangle")) {
    breakoutLevel = support;
    // Use recent 5-candle low to catch a confirmed breakdown that closed below
    const recentLow = Math.min(...recentCandles.slice(-5).map(c => parseFloat(c.l)));
    const breakdownPercent = ((support - recentLow) / support) * 100;
    if (breakdownPercent > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice < support) {
      status = "breakout_pending";
    }
    entryPrice = status === "breakout_confirmed" ? currentPrice : breakoutLevel;
    stopLoss = resistance + (range * 0.1);
    takeProfit = support - range;
    if (takeProfit >= entryPrice) takeProfit = entryPrice - range;
  } else {
    return null;
  }

  return {
    name: patternName,
    displayName,
    status,
    entryPrice,
    stopLoss,
    takeProfit,
    breakoutLevel,
    currentPrice,
    confidence: status === "breakout_confirmed" ? 75 : status === "breakout_pending" ? 60 : 48,
  };
}

function detectTrianglePattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern[] {
  return scanPatternWindows(candles, [40, 48, 56, 64, 72], 36, 3, (window) =>
    detectTrianglePatternInWindow(window, isBullish, timeframe),
  );
}

// Detect Double Top/Bottom patterns — strict, real-TA criteria
function detectDoublePatternInWindow(
  recentCandles: HyperliquidCandle[],
  isBullish: boolean,
  timeframe: string,
): DetectedPattern | null {
  if (recentCandles.length < 80) return null;

  const thresholds = getThresholds(timeframe);

  // Use lookback=6 for higher timeframes (fewer, more meaningful swings)
  const swingLookback = ["1h", "4h", "1d"].includes(timeframe) ? 7 : 5;
  const { highs, lows } = findSwingPoints(recentCandles, swingLookback);
  const peakTolerancePct =
    timeframe === "1m" || timeframe === "3m" || timeframe === "5m" ? 0.75 : 0.6;
  const minValleyDepthPct =
    timeframe === "1m" || timeframe === "3m" || timeframe === "5m" ? 1.0 : 1.25;

  const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);

  // ─── DOUBLE TOP (bearish reversal) ───────────────────────────────────────────
  if (!isBullish && highs.length >= 2) {
    // Find the two highest swing highs (not just the last two) that are separated in time
    const sortedByPrice = [...highs].sort((a, b) => b.price - a.price);

    // Try pairs of the top swing highs (by price) until a valid double top is found
    for (let i = 0; i < Math.min(sortedByPrice.length, 5); i++) {
      for (let j = i + 1; j < Math.min(sortedByPrice.length, 6); j++) {
        const h1 = sortedByPrice[i].idx < sortedByPrice[j].idx ? sortedByPrice[i] : sortedByPrice[j];
        const h2 = sortedByPrice[i].idx < sortedByPrice[j].idx ? sortedByPrice[j] : sortedByPrice[i];

        const avgHigh = (h1.price + h2.price) / 2;
        const priceDiffPct = (Math.abs(h1.price - h2.price) / avgHigh) * 100;
        const candlesBetween = h2.idx - h1.idx;

        // Strict criteria:
        // 1. Two peaks within a tight tolerance of each other
        // 2. At least 8 candles apart so they're truly separate tops
        // 3. At most 60 candles apart so they're in the same price structure
        if (priceDiffPct > peakTolerancePct) continue;
        if (candlesBetween < 8 || candlesBetween > 60) continue;

        // Find the neckline: lowest low BETWEEN the two tops
        const lowsBetween = lows.filter(l => l.idx > h1.idx && l.idx < h2.idx);
        if (lowsBetween.length === 0) continue;

        const neckline = Math.min(...lowsBetween.map(l => l.price));
        const patternHeight = avgHigh - neckline;

        // 4. Valley must be materially below the tops — otherwise it's just noise
        const valleyDepthPct = (patternHeight / avgHigh) * 100;
        if (valleyDepthPct < minValleyDepthPct) continue;

        // 5. Pattern height must meet the timeframe's minimum move threshold
        if ((patternHeight / avgHigh) * 100 < thresholds.minMovePercent) continue;

        // 6. Current price must be within the pattern range (not far away)
        // Price should be at or below the neckline, or between neckline and tops
        if (currentPrice > avgHigh * 1.01) continue; // Price already broke above — not a double top
        if (currentPrice < neckline * 0.95) continue; // Price already ran too far down — old pattern

        let status: DetectedPattern["status"] = "forming";
        const breakoutPercent = ((neckline - currentPrice) / neckline) * 100;
        if (breakoutPercent > thresholds.minBreakoutPercent) {
          status = "breakout_confirmed";
        } else if (currentPrice < neckline) {
          status = "breakout_pending";
        }

        const entryPrice = status === "breakout_confirmed" ? currentPrice : neckline;
        let takeProfit = neckline - patternHeight;
        if (takeProfit >= entryPrice) takeProfit = entryPrice - patternHeight;

        return {
          name: "double_top",
          displayName: "Double Top",
          status,
          entryPrice,
          stopLoss: avgHigh + patternHeight * 0.1,
          takeProfit,
          breakoutLevel: neckline,
          currentPrice,
          confidence: status === "breakout_confirmed" ? 75 : status === "breakout_pending" ? 62 : 48,
        };
      }
    }
  }

  // ─── DOUBLE BOTTOM (bullish reversal) ────────────────────────────────────────
  if (isBullish && lows.length >= 2) {
    const sortedByPrice = [...lows].sort((a, b) => a.price - b.price); // lowest first

    for (let i = 0; i < Math.min(sortedByPrice.length, 5); i++) {
      for (let j = i + 1; j < Math.min(sortedByPrice.length, 6); j++) {
        const l1 = sortedByPrice[i].idx < sortedByPrice[j].idx ? sortedByPrice[i] : sortedByPrice[j];
        const l2 = sortedByPrice[i].idx < sortedByPrice[j].idx ? sortedByPrice[j] : sortedByPrice[i];

        const avgLow = (l1.price + l2.price) / 2;
        const priceDiffPct = (Math.abs(l1.price - l2.price) / avgLow) * 100;
        const candlesBetween = l2.idx - l1.idx;

        if (priceDiffPct > peakTolerancePct) continue;
        if (candlesBetween < 8 || candlesBetween > 60) continue;

        const highsBetween = highs.filter(h => h.idx > l1.idx && h.idx < l2.idx);
        if (highsBetween.length === 0) continue;

        const neckline = Math.max(...highsBetween.map(h => h.price));
        const patternHeight = neckline - avgLow;

        const valleyHeightPct = (patternHeight / avgLow) * 100;
        if (valleyHeightPct < minValleyDepthPct) continue;

        if ((patternHeight / avgLow) * 100 < thresholds.minMovePercent) continue;

        // Price must still be within pattern range
        if (currentPrice < avgLow * 0.99) continue; // Already broke below — not a double bottom
        if (currentPrice > neckline * 1.05) continue; // Already ran too far up — old pattern

        let status: DetectedPattern["status"] = "forming";
        const breakoutPercent = ((currentPrice - neckline) / neckline) * 100;
        if (breakoutPercent > thresholds.minBreakoutPercent) {
          status = "breakout_confirmed";
        } else if (currentPrice > neckline) {
          status = "breakout_pending";
        }

        const entryPrice = status === "breakout_confirmed" ? currentPrice : neckline;
        let takeProfit = neckline + patternHeight;
        if (takeProfit <= entryPrice) takeProfit = entryPrice + patternHeight;

        return {
          name: "double_bottom",
          displayName: "Double Bottom",
          status,
          entryPrice,
          stopLoss: avgLow - patternHeight * 0.1,
          takeProfit,
          breakoutLevel: neckline,
          currentPrice,
          confidence: status === "breakout_confirmed" ? 75 : status === "breakout_pending" ? 62 : 48,
        };
      }
    }
  }

  return null;
}

function detectDoublePattern(candles: HyperliquidCandle[], isBullish: boolean, timeframe: string): DetectedPattern[] {
  return scanPatternWindows(candles, [80, 96, 112, 128], 48, 4, (window) =>
    detectDoublePatternInWindow(window, isBullish, timeframe),
  );
}

// Detect Wedge patterns (Rising/Falling)
// A wedge is defined by two converging trendlines — both pointing the SAME direction
// (both up for rising wedge, both down for falling wedge) but with different slopes,
// so the lines are squeezing together. The breakout is AGAINST the wedge direction.
function detectWedgePatternInWindow(
  recentCandles: HyperliquidCandle[],
  mode: "rising" | "falling",
  timeframe: string,
): DetectedPattern | null {
  if (recentCandles.length < 40) return null;

  const thresholds = getThresholds(timeframe);
  const avgPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
  const { highs, lows } = findSwingPoints(recentCandles, 3);

  if (highs.length < 3 || lows.length < 3) return null;

  const recentHighs = highs.slice(-3);
  const recentLows  = lows.slice(-3);

  const highIdxSpan = (recentHighs[recentHighs.length - 1].idx - recentHighs[0].idx) || 1;
  const lowIdxSpan  = (recentLows[recentLows.length - 1].idx  - recentLows[0].idx)  || 1;

  // Raw slopes (price per candle)
  const highSlopeRaw = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / highIdxSpan;
  const lowSlopeRaw  = (recentLows[recentLows.length - 1].price  - recentLows[0].price)  / lowIdxSpan;

  // Normalize slopes to % of current price per candle (so BTC vs altcoins use same thresholds)
  const highSlope = (highSlopeRaw / avgPrice) * 100;
  const lowSlope  = (lowSlopeRaw  / avgPrice) * 100;

  const currentPrice = parseFloat(recentCandles[recentCandles.length - 1].c);
  const resistance   = recentHighs[recentHighs.length - 1].price;
  const support      = recentLows[recentLows.length - 1].price;
  const range        = resistance - support;

  // Guard: trendlines must not have already crossed; range must be meaningful
  if (resistance <= support) return null;
  const rangePct = (range / avgPrice) * 100;
  if (rangePct < 0.3) return null; // Wedge too flat to be meaningful

  // BTC / majors often compress with shallower trendlines than alts on short windows.
  const minSlopeMag = timeframe === "1m" || timeframe === "3m" || timeframe === "5m" ? 0.005 : 0.0065;

  // ── Rising Wedge (bearish) ────────────────────────────────────────────────
  // Both trendlines slope UP, but lower rises faster → lines converge from below
  // highSlope > 0, lowSlope > 0, lowSlope > highSlope (lower rising faster)
  if (
    mode === "rising" &&
    highSlope > minSlopeMag &&
    lowSlope  > minSlopeMag &&
    lowSlope  > highSlope // lower trendline rises faster → convergence
  ) {
    // Measure convergence: difference in slopes must be at least 0.01%/candle
    if (lowSlope - highSlope < minSlopeMag) return null;

    let status: DetectedPattern["status"] = "forming";
    const recentLow = Math.min(...recentCandles.slice(-5).map(c => parseFloat(c.l)));
    const breakdownPct = ((support - recentLow) / support) * 100;
    if (breakdownPct > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice < support) {
      status = "breakout_pending";
    }

    const entryPrice = status === "breakout_confirmed" ? currentPrice : support;
    let takeProfit = support - range;
    if (takeProfit >= entryPrice) takeProfit = entryPrice - range;

    return {
      name: "rising_wedge",
      displayName: "Rising Wedge (Bearish)",
      status,
      entryPrice,
      stopLoss: resistance + (range * 0.1),
      takeProfit,
      breakoutLevel: support,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 70 : status === "breakout_pending" ? 55 : 42,
    };
  }

  // ── Falling Wedge (bullish) ───────────────────────────────────────────────
  // Both trendlines slope DOWN, but upper falls faster → lines converge from above
  // highSlope < 0, lowSlope < 0, highSlope < lowSlope (upper falling faster = more negative)
  if (
    mode === "falling" &&
    highSlope < -minSlopeMag &&
    lowSlope  < -minSlopeMag &&
    highSlope < lowSlope // upper falls faster → convergence
  ) {
    // Measure convergence
    if (lowSlope - highSlope < minSlopeMag) return null;

    let status: DetectedPattern["status"] = "forming";
    const recentHigh = Math.max(...recentCandles.slice(-5).map(c => parseFloat(c.h)));
    const breakoutPct = ((recentHigh - resistance) / resistance) * 100;
    if (breakoutPct > thresholds.minBreakoutPercent) {
      status = "breakout_confirmed";
    } else if (currentPrice > resistance) {
      status = "breakout_pending";
    }

    const entryPrice = status === "breakout_confirmed" ? currentPrice : resistance;
    let takeProfit = resistance + range;
    if (takeProfit <= entryPrice) takeProfit = entryPrice + range;

    return {
      name: "falling_wedge",
      displayName: "Falling Wedge (Bullish)",
      status,
      entryPrice,
      stopLoss: support - (range * 0.1),
      takeProfit,
      breakoutLevel: resistance,
      currentPrice,
      confidence: status === "breakout_confirmed" ? 70 : status === "breakout_pending" ? 55 : 42,
    };
  }

  return null;
}

function detectWedgePattern(candles: HyperliquidCandle[], timeframe: string): DetectedPattern[] {
  const rising = scanPatternWindows(candles, [40, 48, 56, 64, 72], 36, 3, (window) =>
    detectWedgePatternInWindow(window, "rising", timeframe),
  );
  const falling = scanPatternWindows(candles, [40, 48, 56, 64, 72], 36, 3, (window) =>
    detectWedgePatternInWindow(window, "falling", timeframe),
  );
  return [...rising, ...falling];
}

/** Pattern direction from structure only — used after OHLC detection (not from MA alignment). */
export function getPatternStructuralBias(p: DetectedPattern): "bullish" | "bearish" | "neutral" {
  switch (p.name) {
    case "head_and_shoulders":
    case "double_top":
    case "rising_wedge":
    case "descending_triangle":
    case "bear_flag":
    case "bearish_pennant":
      return "bearish";
    case "inverse_head_and_shoulders":
    case "double_bottom":
    case "falling_wedge":
    case "ascending_triangle":
    case "bull_flag":
    case "bullish_pennant":
    case "cup_and_handle":
      return "bullish";
    case "symmetrical_triangle":
    default:
      return "neutral";
  }
}

/** Run all geometry-based detectors without using MA bias to gate which runs. */
export function collectPatternCandidates(
  candles: HyperliquidCandle[],
  timeframe: string,
  options?: { skipFlags?: boolean },
): DetectedPattern[] {
  const candidates: DetectedPattern[] = [];
  const add = (p: DetectedPattern | null) => {
    if (!p) return;
    if (candidates.some((c) => patternsLooselyEqual(c, p))) return;
    candidates.push(p);
  };
  const addAll = (arr: DetectedPattern[]) => {
    for (const p of arr) add(p);
  };
  if (!options?.skipFlags) {
    addAll(detectFlagPatterns(candles, true, timeframe));
    addAll(detectFlagPatterns(candles, false, timeframe));
  }
  addAll(detectTrianglePattern(candles, true, timeframe));
  addAll(detectTrianglePattern(candles, false, timeframe));
  addAll(detectDoublePattern(candles, true, timeframe));
  addAll(detectDoublePattern(candles, false, timeframe));
  addAll(detectWedgePattern(candles, timeframe));
  return candidates;
}

// Detect crossovers
export function detectCrossover(
  currentSMA: SMAValues,
  previousSMA: SMAValues | null
): "bullish_crossover" | "bearish_crossover" | null {
  if (!previousSMA) return null;
  
  const currentDiff = currentSMA.sma21 - currentSMA.sma200;
  const previousDiff = previousSMA.sma21 - previousSMA.sma200;
  
  if (previousDiff < 0 && currentDiff >= 0) return "bullish_crossover";
  if (previousDiff > 0 && currentDiff <= 0) return "bearish_crossover";
  
  return null;
}

// Main analysis function - scans for ALL pattern types
export async function analyzeCoinForSignals(
  coin: string,
  timeframe: string = "1m"
): Promise<CrossoverSignal | null> {
  try {
    const intervalMap: Record<string, string> = {
      "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
      "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1d",
    };
    
    const interval = intervalMap[timeframe] || "1m";
    const candleMinutes: Record<string, number> = {
      "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
      "1h": 60, "2h": 120, "4h": 240, "1d": 1440,
    };
    
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 350;
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    
    if (candles.length < 210) return null;
    
    const currentSMA = calculateSMAFromCandles(candles);
    if (!currentSMA) return null;

    const previousCandles = candles.slice(0, -5);
    const previousSMA = calculateSMAFromCandles(previousCandles);
    const crossover = detectCrossover(currentSMA, previousSMA);

    const patterns = collectPatternCandidates(candles, timeframe);
    sortPatternCandidatesByActionability(patterns);
    const bestPattern =
      patterns.find((p) => getPatternStructuralBias(p) !== "neutral") ?? null;

    if (bestPattern) {
      const structuralBias = getPatternStructuralBias(bestPattern);
      const risk = Math.abs(bestPattern.entryPrice - bestPattern.stopLoss);
      const reward = Math.abs(bestPattern.takeProfit - bestPattern.entryPrice);
      const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : "0";

      let description: string;
      let status: CrossoverSignal["status"];

      if (bestPattern.status === "breakout_confirmed") {
        status = "breakout";
        description = `${bestPattern.displayName} BREAKOUT on ${timeframe}! Entry $${bestPattern.entryPrice.toFixed(2)}, SL $${bestPattern.stopLoss.toFixed(2)}, TP $${bestPattern.takeProfit.toFixed(2)}. R:R ${rrRatio}:1`;
      } else {
        status = "forming";
        description = `${bestPattern.displayName} FORMING on ${timeframe}. Breakout level: $${bestPattern.breakoutLevel.toFixed(2)}. WAIT for confirmation! Potential R:R ${rrRatio}:1`;
      }

      return {
        id: `${coin}-${timeframe}-${Date.now()}`,
        coin,
        type: structuralBias === "bullish" ? "bullish_setup" : "bearish_setup",
        status,
        timeframe,
        sma21: currentSMA.sma21,
        sma200: currentSMA.sma200,
        currentPrice: currentSMA.price,
        entryPrice: bestPattern.entryPrice,
        suggestedSL: bestPattern.stopLoss,
        suggestedTP: bestPattern.takeProfit,
        confidence: bestPattern.confidence,
        detectedAt: new Date(),
        description,
        patternType: bestPattern.status === "breakout_confirmed"
          ? `${bestPattern.displayName} - ENTRY NOW`
          : `${bestPattern.displayName} - WAIT`,
      };
    }

    if (crossover) {
      return {
        id: `${coin}-${timeframe}-${Date.now()}`,
        coin,
        type: crossover,
        status: "confirmed",
        timeframe,
        sma21: currentSMA.sma21,
        sma200: currentSMA.sma200,
        currentPrice: currentSMA.price,
        entryPrice: currentSMA.price,
        suggestedSL: crossover === "bullish_crossover" ? currentSMA.sma200 * 0.99 : currentSMA.sma200 * 1.01,
        suggestedTP: crossover === "bullish_crossover" ? currentSMA.price * 1.03 : currentSMA.price * 0.97,
        confidence: 85,
        detectedAt: new Date(),
        description: `21 SMA crossed ${crossover === "bullish_crossover" ? "ABOVE" : "BELOW"} 200 SMA on ${timeframe}. ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"} bias confirmed. Look for pattern setups!`,
        patternType: `SMA Crossover - ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"}`,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error analyzing ${coin} for signals:`, error);
    return null;
  }
}

// Scan multiple coins for signals across all timeframes
export async function scanForSignals(
  coins: string[],
  timeframes: string[] = DEFAULT_SCAN_TIMEFRAMES
): Promise<CrossoverSignal[]> {
  const limit = pLimit(10);
  const tasks = coins.flatMap((coin) => timeframes.map((tf) => () => analyzeCoinForSignals(coin, tf)));
  const results = await Promise.all(tasks.map((fn) => limit(fn)));
  const signals = results.filter((x): x is CrossoverSignal => x != null);
  signals.sort((a, b) => {
    if (a.status === "breakout" && b.status !== "breakout") return -1;
    if (b.status === "breakout" && a.status !== "breakout") return 1;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
  return signals;
}

// Get current SMA status for a coin
export async function getSMAStatus(
  coin: string,
  timeframe: string = "1m"
): Promise<{
  sma21: number;
  sma200: number;
  price: number;
  trend: "bullish" | "bearish" | "neutral";
  crossoverProximity: number;
} | null> {
  try {
    const intervalMap: Record<string, string> = {
      "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
      "1h": "1h", "2h": "2h", "4h": "4h", "1d": "1d",
    };
    const interval = intervalMap[timeframe] || "1m";
    
    const candleMinutes: Record<string, number> = {
      "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
      "1h": 60, "2h": 120, "4h": 240, "1d": 1440,
    };
    const minutes = candleMinutes[timeframe] || 1;
    const requiredCandles = 250;
    const durationMs = requiredCandles * minutes * 60 * 1000;
    
    const endTime = Date.now();
    const startTime = endTime - durationMs;
    
    const candles = await getCandles(coin, interval, startTime, endTime);
    const sma = calculateSMAFromCandles(candles);
    
    if (!sma) return null;
    
    const trend = sma.sma21 > sma.sma200 ? "bullish" : sma.sma21 < sma.sma200 ? "bearish" : "neutral";
    const crossoverProximity = Math.abs((sma.sma21 - sma.sma200) / sma.sma200) * 100;
    
    return {
      sma21: sma.sma21,
      sma200: sma.sma200,
      price: sma.price,
      trend,
      crossoverProximity,
    };
  } catch (error) {
    console.error(`Error getting SMA status for ${coin}:`, error);
    return null;
  }
}
