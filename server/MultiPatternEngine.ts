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

export type ScannerMarketBias = "bullish" | "bearish" | "neutral_choppy";

/** Geometry + actionability only — 21/200 SMMA must not demote or suppress counter-trend setups. */
function scoreCandidate(p: DetectedPattern, _marketBias: ScannerMarketBias, volumeOk: boolean): number {
  const structural = getPatternStructuralBias(p);
  let s = 220 + p.confidence;
  if (structural !== "neutral") s += 24;
  if (volumeOk) s += 18;
  if (p.status === "breakout_confirmed") s += 45;
  else if (p.status === "breakout_pending") s += 25;
  return s;
}

function upsertByScore(
  map: Map<string, { p: DetectedPattern; volumeOk: boolean }>,
  item: { p: DetectedPattern; volumeOk: boolean },
  marketBias: ScannerMarketBias,
) {
  const k = item.p.name;
  const ex = map.get(k);
  const sNew = scoreCandidate(item.p, marketBias, item.volumeOk);
  const sOld = ex ? scoreCandidate(ex.p, marketBias, ex.volumeOk) : -Infinity;
  if (!ex || sNew > sOld) map.set(k, item);
}

export type MultiPatternGatherRow = { p: DetectedPattern; volumeOk: boolean };

export function gatherMultiPatternCandidates(
  candles: HyperliquidCandle[],
  timeframe: string,
  marketBias: ScannerMarketBias,
): { rows: MultiPatternGatherRow[]; apexResult: ApexGeometricResult } {
  const apexResult = runApexGeometricFlagScan(candles, timeframe);
  const candMap = new Map<string, { p: DetectedPattern; volumeOk: boolean }>();

  const base = collectPatternCandidates(candles, timeframe);
  sortPatternCandidatesByActionability(base);
  for (const p of base) upsertByScore(candMap, { p, volumeOk: false }, marketBias);

  if (apexResult.pattern) {
    upsertByScore(candMap, { p: apexResult.pattern, volumeOk: true }, marketBias);
  }

  const hs = detectHeadAndShoulders(candles);
  if (hs) upsertByScore(candMap, { p: hs, volumeOk: false }, marketBias);
  const ihs = detectInverseHeadAndShoulders(candles);
  if (ihs) upsertByScore(candMap, { p: ihs, volumeOk: false }, marketBias);

  const strictBull = detectStrictFlagWithVolume(candles, true);
  if (strictBull) upsertByScore(candMap, { p: strictBull.pattern, volumeOk: strictBull.volumeOk }, marketBias);
  const strictBear = detectStrictFlagWithVolume(candles, false);
  if (strictBear) upsertByScore(candMap, { p: strictBear.pattern, volumeOk: strictBear.volumeOk }, marketBias);

  const rows = [...candMap.values()].sort(
    (a, b) => scoreCandidate(b.p, marketBias, b.volumeOk) - scoreCandidate(a.p, marketBias, a.volumeOk),
  );
  return { rows, apexResult };
}
