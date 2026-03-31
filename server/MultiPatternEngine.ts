/**
 * Multi-pattern scan: runs **every** geometry detector in the Equilibrium library (flags, triangles,
 * doubles, wedges), Apex pole+flag, strict volume flags, and H&S family — **without** SMMA suppressing
 * bearish setups in bullish regimes (SMMA is advisory on the emitted signal only).
 */
import type { HyperliquidCandle } from "./hyperliquid";
import {
  collectPatternCandidates,
  sortPatternCandidatesByActionability,
  getPatternStructuralBias,
  type DetectedPattern,
} from "./sma-detection";
import { runApexGeometricFlagScan, type ApexGeometricResult } from "./ApexDetectionEngine";
import { detectHeadAndShoulders, detectInverseHeadAndShoulders } from "./pattern-shoulders";
import { detectStrictFlagWithVolume } from "./pattern-strict-volume";

/** Geometry + actionability only — 21/200 SMMA must not demote or suppress counter-trend setups. */
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

function filterOpposingFlagDirections(
  rows: MultiPatternGatherRow[],
): MultiPatternGatherRow[] {
  const bullFlags = rows.filter((row) => row.p.name === "bull_flag");
  const bearFlags = rows.filter((row) => row.p.name === "bear_flag");

  if (bullFlags.length === 0 || bearFlags.length === 0) return rows;

  const bestBull = Math.max(...bullFlags.map((row) => scoreCandidate(row.p, row.volumeOk)));
  const bestBear = Math.max(...bearFlags.map((row) => scoreCandidate(row.p, row.volumeOk)));
  const keepBull = bestBull >= bestBear;

  return rows.filter((row) => {
    if (keepBull && row.p.name === "bear_flag") return false;
    if (!keepBull && row.p.name === "bull_flag") return false;
    return true;
  });
}

export function gatherMultiPatternCandidates(
  candles: HyperliquidCandle[],
  timeframe: string,
): { rows: MultiPatternGatherRow[]; apexResult: ApexGeometricResult } {
  const apexResult = runApexGeometricFlagScan(candles, timeframe);
  const candMap = new Map<string, { p: DetectedPattern; volumeOk: boolean }>();

  const base = collectPatternCandidates(candles, timeframe);
  sortPatternCandidatesByActionability(base);
  for (const p of base) upsertByScore(candMap, { p, volumeOk: false });

  if (apexResult.pattern) {
    upsertByScore(candMap, { p: apexResult.pattern, volumeOk: true });
  }

  const hs = detectHeadAndShoulders(candles);
  if (hs) upsertByScore(candMap, { p: hs, volumeOk: false });
  const ihs = detectInverseHeadAndShoulders(candles);
  if (ihs) upsertByScore(candMap, { p: ihs, volumeOk: false });

  const strictBull = detectStrictFlagWithVolume(candles, true);
  if (strictBull) upsertByScore(candMap, { p: strictBull.pattern, volumeOk: strictBull.volumeOk });
  const strictBear = detectStrictFlagWithVolume(candles, false);
  if (strictBear) upsertByScore(candMap, { p: strictBear.pattern, volumeOk: strictBear.volumeOk });

  const rows = filterOpposingFlagDirections(
    [...candMap.values()].sort(
      (a, b) => scoreCandidate(b.p, b.volumeOk) - scoreCandidate(a.p, a.volumeOk),
    ),
  );
  return { rows, apexResult };
}
