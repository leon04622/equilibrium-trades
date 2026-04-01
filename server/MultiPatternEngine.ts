/**
 * Multi-pattern scan: runs geometry detectors (flags, triangles, doubles, wedges), Apex pole+flag,
 * strict volume flags, and H&S family.
 *
 * **Bull vs bear flags:** continuation flags are aligned with 21/200 SMMA trend (and neutral-MA
 * momentum) so a bearish chart cannot surface a bull flag just because geometry scored higher.
 */
import type { HyperliquidCandle } from "./hyperliquid";
import {
  collectPatternCandidates,
  sortPatternCandidatesByActionability,
  calculateSMAFromCandles,
  getPatternStructuralBias,
  type DetectedPattern,
  type SMAValues,
} from "./sma-detection";
import { runApexGeometricFlagScan, type ApexGeometricResult } from "./ApexDetectionEngine";
import { detectHeadAndShoulders, detectInverseHeadAndShoulders } from "./pattern-shoulders";
import { detectStrictFlagWithVolume } from "./pattern-strict-volume";

/**
 * Bull/bear flags are continuation patterns. If 21 SMMA is below 200, do not emit a bull flag; if above,
 * do not emit a bear flag. When MAs are neutral, use ~48-bar momentum so obvious downtrends are not
 * labeled as bull flags.
 */
function flagAgreesWithTrendContext(
  p: DetectedPattern,
  sma: SMAValues | null,
  candles: HyperliquidCandle[],
): boolean {
  if (p.name !== "bull_flag" && p.name !== "bear_flag") return true;
  if (!sma) return true;

  const rel = (sma.sma21 - sma.sma200) / Math.max(Math.abs(sma.sma200), 1e-12);
  const neutralMa = Math.abs(rel) < 0.0035;

  if (!neutralMa) {
    if (p.name === "bull_flag") return rel > 0;
    if (p.name === "bear_flag") return rel < 0;
  }

  const closes = candles.slice(-48).map((c) => parseFloat(c.c));
  if (closes.length < 20) return true;
  const netPct = ((closes[closes.length - 1] - closes[0]) / Math.max(closes[0], 1e-12)) * 100;
  const momEps = 0.15;
  if (p.name === "bull_flag" && netPct < -momEps) return false;
  if (p.name === "bear_flag" && netPct > momEps) return false;
  return true;
}

function scoreCandidate(p: DetectedPattern, volumeOk: boolean): number {
  const structural = getPatternStructuralBias(p);
  let s = 220 + p.confidence;
  if (structural !== "neutral") s += 24;
  if (volumeOk) s += 18;
  if (p.status === "breakout_confirmed") s += 45;
  else if (p.status === "breakout_pending") s += 25;
  return s;
}

function patternLifecycleKey(p: DetectedPattern): "confirmed" | "pending" | "forming" {
  if (p.status === "breakout_confirmed") return "confirmed";
  if (p.status === "breakout_pending") return "pending";
  return "forming";
}

/** One row per pattern name **and** lifecycle stage so forming setups are not replaced by breakouts. */
function upsertByScore(
  map: Map<string, { p: DetectedPattern; volumeOk: boolean }>,
  item: { p: DetectedPattern; volumeOk: boolean },
) {
  const k = `${item.p.name}::${patternLifecycleKey(item.p)}`;
  const ex = map.get(k);
  const sNew = scoreCandidate(item.p, item.volumeOk);
  const sOld = ex ? scoreCandidate(ex.p, ex.volumeOk) : -Infinity;
  if (!ex || sNew > sOld) map.set(k, item);
}

export type MultiPatternGatherRow = { p: DetectedPattern; volumeOk: boolean };

/**
 * Named pairs that imply opposite directional theses on the same bars.
 * Applied inside `gatherMultiPatternCandidates` for **every** coin and **every** timeframe the scanner
 * evaluates (`analyzeEducationalUniversal` calls this once per TF), so beginners never see both sides at once.
 */
const OPPOSING_PATTERN_PAIRS: readonly [string, string][] = [
  ["bull_flag", "bear_flag"],
  ["double_top", "double_bottom"],
  ["head_and_shoulders", "inverse_head_and_shoulders"],
  ["rising_wedge", "falling_wedge"],
  ["ascending_triangle", "descending_triangle"],
  ["bullish_pennant", "bearish_pennant"],
];

/** If both pattern names appear in the candidate set, keep only the higher-scoring side (all lifecycle rows). */
function filterOpposingNamedPair(
  rows: MultiPatternGatherRow[],
  nameA: string,
  nameB: string,
): MultiPatternGatherRow[] {
  const aRows = rows.filter((row) => row.p.name === nameA);
  const bRows = rows.filter((row) => row.p.name === nameB);
  if (aRows.length === 0 || bRows.length === 0) return rows;

  const bestA = Math.max(...aRows.map((row) => scoreCandidate(row.p, row.volumeOk)));
  const bestB = Math.max(...bRows.map((row) => scoreCandidate(row.p, row.volumeOk)));
  const keepA = bestA >= bestB;

  return rows.filter((row) => {
    if (keepA && row.p.name === nameB) return false;
    if (!keepA && row.p.name === nameA) return false;
    return true;
  });
}

function applyBeginnerOpposingFilters(rows: MultiPatternGatherRow[]): MultiPatternGatherRow[] {
  let out = rows;
  for (const [a, b] of OPPOSING_PATTERN_PAIRS) {
    out = filterOpposingNamedPair(out, a, b);
  }
  return out;
}

export function gatherMultiPatternCandidates(
  candles: HyperliquidCandle[],
  timeframe: string,
): { rows: MultiPatternGatherRow[]; apexResult: ApexGeometricResult } {
  const sma = calculateSMAFromCandles(candles);
  const apexResult = runApexGeometricFlagScan(candles, timeframe);
  const candMap = new Map<string, { p: DetectedPattern; volumeOk: boolean }>();

  const base = collectPatternCandidates(candles, timeframe);
  sortPatternCandidatesByActionability(base);
  for (const p of base) {
    if (!flagAgreesWithTrendContext(p, sma, candles)) continue;
    upsertByScore(candMap, { p, volumeOk: false });
  }

  if (apexResult.pattern && flagAgreesWithTrendContext(apexResult.pattern, sma, candles)) {
    upsertByScore(candMap, { p: apexResult.pattern, volumeOk: !!apexResult.volumeOk });
  }

  const hs = detectHeadAndShoulders(candles);
  if (hs) upsertByScore(candMap, { p: hs, volumeOk: false });
  const ihs = detectInverseHeadAndShoulders(candles);
  if (ihs) upsertByScore(candMap, { p: ihs, volumeOk: false });

  const strictBull = detectStrictFlagWithVolume(candles, true);
  if (strictBull && flagAgreesWithTrendContext(strictBull.pattern, sma, candles)) {
    upsertByScore(candMap, { p: strictBull.pattern, volumeOk: strictBull.volumeOk });
  }
  const strictBear = detectStrictFlagWithVolume(candles, false);
  if (strictBear && flagAgreesWithTrendContext(strictBear.pattern, sma, candles)) {
    upsertByScore(candMap, { p: strictBear.pattern, volumeOk: strictBear.volumeOk });
  }

  const rows = applyBeginnerOpposingFilters(
    [...candMap.values()].sort(
      (a, b) => scoreCandidate(b.p, b.volumeOk) - scoreCandidate(a.p, a.volumeOk),
    ),
  );

  let apexForUi = apexResult;
  if (
    apexResult.pattern &&
    (apexResult.pattern.name === "bull_flag" || apexResult.pattern.name === "bear_flag") &&
    !flagAgreesWithTrendContext(apexResult.pattern, sma, candles)
  ) {
    apexForUi = {
      ...apexResult,
      pattern: null,
      scanState: "no_pattern",
      note: "Apex flag geometry disagreed with trend context (21/200 SMMA + recent momentum).",
      volumeOk: undefined,
      poleMovePct: undefined,
      poleBodyRatio: undefined,
      retraceRatio: undefined,
    };
  }

  return { rows, apexResult: apexForUi };
}
