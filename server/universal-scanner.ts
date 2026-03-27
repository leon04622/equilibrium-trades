/**
 * Universal pattern engine (Equilibrium): MTF fresh candles, 21/200 SMMA + pivot structure bias,
 * strict flags (≥5% pole in 10 bars, ≤50% retrace, volume contraction in flag), H&S family,
 * bias-locked candidate ranking, timeframe-aware education copy.
 */
import pLimit from "p-limit";
import { getCandles, type HyperliquidCandle } from "./hyperliquid";
import {
  GLOBAL_SCANNER_BATCH_SIZE,
  GLOBAL_SCANNER_BATCH_DELAY_MS,
  chunkArray,
  sleep,
  finalizeScannerHealthRun,
  getScannerHealthMonitoringEnabled,
  isGoldScannerTicker,
  type ScannerHealthErrorRow,
} from "./global-scanner";
import { PATTERN_SCAN_CANDLE_LIMIT } from "./scanner-controller";
import {
  calculateSMAFromCandles,
  detectCrossover,
  collectPatternCandidates,
  sortPatternCandidatesByActionability,
  getPatternStructuralBias,
  type DetectedPattern,
} from "./sma-detection";
import {
  runApexGeometricFlagScan,
  is15mTrendBullish,
  is15mTrendBearish,
} from "./ApexDetectionEngine";

export const UNIVERSAL_SCAN_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
] as const;

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** Fetch / analyze lower timeframes first (1m, 5m) so fast TFs are not blocked behind 1d candle pulls. */
const SCAN_TF_ORDER = ["1m", "5m", "3m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;

export function prioritizeScanTimeframes(timeframes: string[]): string[] {
  const raw = timeframes.filter(Boolean);
  const uniq = [...new Set(raw)];
  if (uniq.length === 0) return [...UNIVERSAL_SCAN_TIMEFRAMES];
  const allowed = new Set<string>([...UNIVERSAL_SCAN_TIMEFRAMES]);
  const ordered = SCAN_TF_ORDER.filter((tf) => uniq.includes(tf));
  const orderedSet = new Set<string>(ordered);
  const rest = uniq.filter((tf) => !orderedSet.has(tf) && allowed.has(tf));
  const out = [...ordered, ...rest];
  return out.length > 0 ? out : [...UNIVERSAL_SCAN_TIMEFRAMES];
}

/** Serialize candleSnapshot calls so full-universe scans do not trip Hyperliquid rate limits. */
const candleFetchLimit = pLimit(16);

/**
 * Candle intervals needed for the requested scan TFs only (not always all nine).
 * 1m high-probability tier needs 15m SMMA — include 15m whenever 1m is scanned.
 * Order: 1m → 5m → … so sequential HL fetches prioritize short TFs.
 */
function intervalsForPatternScan(timeframes: string[]): readonly string[] {
  const set = new Set(timeframes.filter(Boolean));
  if (set.size === 0) return [...UNIVERSAL_SCAN_TIMEFRAMES];
  if (set.has("1m")) set.add("15m");
  return SCAN_TF_ORDER.filter((iv) => set.has(iv));
}

export type MarketBias = "bullish" | "bearish" | "neutral_choppy";

export interface EducationalPatternSignal {
  id: string;
  coin: string;
  timeframe: string;
  bias: "bullish" | "bearish" | "neutral";
  patternName: string;
  patternStatus: "forming" | "developed" | "breakout_watch";
  sma21: number;
  sma200: number;
  currentPrice: number;
  smaRelationship: string;
  educationalNote: string;
  whatToWatch: string;
  detectedAt: Date;
  tradeable: boolean;
  maFilterReason: string;
  /** Pattern structure opposes SMMA + swing-defined market bias */
  counterTrend?: boolean;
  /** Strict flag: volume softer in flag vs pole */
  volumeConfirmed?: boolean;
  /** Human-readable trend-first context */
  marketBiasLabel?: string;
  /** Apex geometric engine (pole + pivot flag) */
  apexEngineNote?: string;
  apexScanState?: "no_pattern" | "ranging" | "bull_flag" | "bear_flag";
  apexTier?: "high_probability_trend_aligned" | "standard" | "no_pattern_apex";
}

function vol(c: HyperliquidCandle): number {
  const v = parseFloat(c.v || "0");
  return Number.isFinite(v) ? v : 0;
}

function avgVolume(slice: HyperliquidCandle[]): number {
  if (slice.length === 0) return 0;
  return slice.reduce((s, x) => s + vol(x), 0) / slice.length;
}

/** Pivot highs / lows (fractal) — structural accuracy for triangles, H&S, bias. */
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

export function inferMarketBias(candles: HyperliquidCandle[]): { bias: MarketBias; label: string } {
  const sma = calculateSMAFromCandles(candles);
  if (!sma) {
    return { bias: "neutral_choppy", label: "Insufficient history for 21/200 SMMA bias." };
  }
  const { highs, lows } = findPivotHighsLows(candles, 3);
  const hh = highs.slice(-4);
  const ll = lows.slice(-4);
  const parts: string[] = [];
  if (hh.length >= 2) {
    parts.push(
      hh[hh.length - 1].price >= hh[0].price * 1.0002
        ? "Swing highs rising (HH)."
        : hh[hh.length - 1].price <= hh[0].price * 0.9998
          ? "Swing highs falling (LH)."
          : "Swing highs mixed.",
    );
  }
  if (ll.length >= 2) {
    parts.push(
      ll[ll.length - 1].price >= ll[0].price * 1.0002
        ? "Swing lows rising (HL)."
        : ll[ll.length - 1].price <= ll[0].price * 0.9998
          ? "Swing lows falling (LL)."
          : "Swing lows mixed.",
    );
  }
  let bias: MarketBias;
  if (sma.sma21 > sma.sma200 * 1.00015) bias = "bullish";
  else if (sma.sma21 < sma.sma200 * 0.99985) bias = "bearish";
  else bias = "neutral_choppy";
  const sm = `21 SMMA ${sma.sma21 > sma.sma200 ? "above" : sma.sma21 < sma.sma200 ? "below" : "near"} 200 SMMA (trend-first).`;
  return { bias, label: [sm, ...parts].join(" ") };
}

/**
 * Pole = 10 bars, ≥5% directional impulse; flag retracement ≤50% of pole height;
 * volume ideally lower in flag than pole (world-class filter).
 */
export function detectStrictFlagWithVolume(
  candles: HyperliquidCandle[],
  isBullish: boolean,
): { pattern: DetectedPattern; volumeOk: boolean } | null {
  const n = candles.length;
  const POLE_LEN = 10;
  const FLAG_MIN = 8;
  const FLAG_MAX = 18;
  if (n < POLE_LEN + FLAG_MIN + 5) return null;

  for (let poleEnd = POLE_LEN; poleEnd <= n - FLAG_MIN - 3; poleEnd++) {
    const pole = candles.slice(poleEnd - POLE_LEN, poleEnd);
    const low = Math.min(...pole.map((c) => parseFloat(c.l)));
    const high = Math.max(...pole.map((c) => parseFloat(c.h)));
    const poleHeight = high - low;
    if (poleHeight <= 0) continue;
    const movePct = isBullish ? (poleHeight / low) * 100 : (poleHeight / high) * 100;
    if (movePct < 5) continue;
    const c0 = parseFloat(pole[0].c);
    const c9 = parseFloat(pole[POLE_LEN - 1].c);
    if (isBullish && c9 <= c0) continue;
    if (!isBullish && c9 >= c0) continue;

    for (let flagLen = FLAG_MIN; flagLen <= FLAG_MAX && poleEnd + flagLen < n; flagLen++) {
      const flag = candles.slice(poleEnd, poleEnd + flagLen);
      const fh = Math.max(...flag.map((c) => parseFloat(c.h)));
      const fl = Math.min(...flag.map((c) => parseFloat(c.l)));
      if (isBullish) {
        const retrace = (high - fl) / poleHeight;
        if (retrace > 0.5) continue;
        if (fl < low * 0.997) continue;
      } else {
        const retrace = (fh - low) / poleHeight;
        if (retrace > 0.5) continue;
        if (fh > high * 1.003) continue;
      }
      const vPole = avgVolume(pole);
      const vFlag = avgVolume(flag);
      const volumeOk = vPole > 0 ? vFlag < vPole * 1.08 : true;

      const tail = candles.slice(poleEnd + flagLen);
      const currentPrice = parseFloat(candles[n - 1].c);
      const flagUpper = Math.max(...flag.map((c) => parseFloat(c.h)));
      const flagLower = Math.min(...flag.map((c) => parseFloat(c.l)));
      const fr = flagUpper - flagLower;
      let status: DetectedPattern["status"] = "forming";
      if (isBullish) {
        const rh = Math.max(...tail.map((c) => parseFloat(c.h)));
        if (rh > flagUpper * 1.0015) status = "breakout_confirmed";
        else if (currentPrice > flagUpper) status = "breakout_pending";
      } else {
        const rl = Math.min(...tail.map((c) => parseFloat(c.l)));
        if (rl < flagLower * 0.9985) status = "breakout_confirmed";
        else if (currentPrice < flagLower) status = "breakout_pending";
      }
      const baseConf =
        status === "breakout_confirmed" ? 68 : status === "breakout_pending" ? 56 : 44;
      const confidence = Math.min(94, baseConf + (volumeOk ? 14 : 0));

      const pattern: DetectedPattern = {
        name: isBullish ? "bull_flag" : "bear_flag",
        displayName: isBullish ? "Bull Flag" : "Bear Flag",
        status,
        entryPrice: isBullish
          ? status === "breakout_confirmed"
            ? currentPrice
            : flagUpper
          : status === "breakout_confirmed"
            ? currentPrice
            : flagLower,
        stopLoss: isBullish ? flagLower - fr * 0.12 : flagUpper + fr * 0.12,
        takeProfit: isBullish ? flagUpper + poleHeight : flagLower - poleHeight,
        breakoutLevel: isBullish ? flagUpper : flagLower,
        currentPrice,
        confidence,
      };
      return { pattern, volumeOk };
    }
  }
  return null;
}

export function detectHeadAndShoulders(candles: HyperliquidCandle[]): DetectedPattern | null {
  if (candles.length < 80) return null;
  const slice = candles.slice(-120);
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
  const slice = candles.slice(-120);
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

function mapMarketToSignalBias(mb: MarketBias): "bullish" | "bearish" | "neutral" {
  if (mb === "bullish") return "bullish";
  if (mb === "bearish") return "bearish";
  return "neutral";
}

function scoreCandidate(
  p: DetectedPattern,
  marketBias: MarketBias,
  volumeOk: boolean,
): number {
  const structural = getPatternStructuralBias(p);
  let tier = 0;
  if (marketBias === "bullish" && structural === "bullish") tier = 320;
  else if (marketBias === "bearish" && structural === "bearish") tier = 320;
  else if (marketBias === "neutral_choppy" && structural !== "neutral") tier = 240;
  else if (structural === "neutral") tier = 160;
  else tier = 40;
  let s = tier + p.confidence;
  if (volumeOk) s += 18;
  if (p.status === "breakout_confirmed") s += 45;
  else if (p.status === "breakout_pending") s += 25;
  return s;
}

function tfHorizon(tf: string): "scalp" | "intraday" | "swing" | "macro" {
  if (tf === "1m" || tf === "3m" || tf === "5m") return "scalp";
  if (tf === "15m" || tf === "30m") return "intraday";
  if (tf === "1h" || tf === "2h") return "swing";
  return "macro";
}

function buildDynamicEducation(
  displayName: string,
  tf: string,
  structuralBias: "bullish" | "bearish" | "neutral",
  counterTrend: boolean,
  volumeOk: boolean,
  patternStatus: EducationalPatternSignal["patternStatus"],
  marketBiasLabel: string,
): { educationalNote: string; whatToWatch: string } {
  const hz = tfHorizon(tf);
  const flagRisk =
    hz === "scalp"
      ? "Immediate scalp risk: noise is high — size down and use tight invalidation."
      : hz === "intraday"
        ? "Intraday follow-through matters — wait for a clean break with participation."
        : hz === "swing"
          ? "Swing timeframe: give the structure room; avoid front-running marginal breaks."
          : "Macro timeframe: this shape can anchor a broader trend reversal or continuation — align with higher-timeframe bias.";

  const bearFlagExtra =
    displayName.includes("Bear") && displayName.includes("Flag")
      ? hz === "scalp"
        ? " 1m–5m bear flags often imply fast mean-reversion risk into support."
        : hz === "macro"
          ? " 4h–1d bear flags more often participate in larger bear trends."
          : ""
      : "";

  const bullFlagExtra =
    displayName.includes("Bull") && displayName.includes("Flag")
      ? hz === "scalp"
        ? " Short-horizon bull flags can fail into liquidity sweeps — watch breakout volume."
        : hz === "macro"
          ? " Higher-timeframe bull flags can precede sustained trend legs."
          : ""
      : "";

  const hsNote =
    displayName.includes("Head and Shoulder") && !displayName.includes("Inverse")
      ? " Three-peak distribution with a central head: watch for sustained trade below the neckline as structural confirmation."
      : displayName.includes("Inverse")
        ? " Three-trough base with a central head: sustained trade above the neckline validates the reversal structure."
        : "";

  let base = `${displayName} on ${tf}: `;
  if (structuralBias === "bullish") base += "Geometry is constructive for upside resolution when confirmation holds.";
  else if (structuralBias === "bearish") base += "Geometry favors downside resolution if support/necklines fail.";
  else base += "Neutral geometry — direction comes from the eventual breakout.";
  if (counterTrend) base += " Labelled Counter-Trend / Secondary vs current market bias — treat as lower conviction unless reclaim/break is decisive.";
  base += ` ${hsNote}${bearFlagExtra}${bullFlagExtra}`;
  if (!volumeOk && (displayName.includes("Flag") || displayName.toLowerCase().includes("triangle"))) {
    base += " Volume did not contract cleanly in consolidation — higher false-break risk.";
  }

  const watch =
    `${marketBiasLabel} ${flagRisk} ` +
    (patternStatus === "forming"
      ? "Pattern still forming — wait for boundary respect and a decisive close beyond the trigger."
      : patternStatus === "breakout_watch"
        ? "Structure mature — prioritize a breakout that expands range with rising volume."
        : "Developed — monitor failed breaks; invalidation is a return deep inside the pattern.");

  return { educationalNote: base.trim(), whatToWatch: watch.trim() };
}

function upsertByScore(
  map: Map<string, { p: DetectedPattern; volumeOk: boolean }>,
  item: { p: DetectedPattern; volumeOk: boolean },
  marketBias: MarketBias,
) {
  const k = item.p.name;
  const ex = map.get(k);
  const sNew = scoreCandidate(item.p, marketBias, item.volumeOk);
  const sOld = ex ? scoreCandidate(ex.p, marketBias, ex.volumeOk) : -Infinity;
  if (!ex || sNew > sOld) map.set(k, item);
}

/**
 * Fresh last-`limit` candles per interval; explicit start/end bypasses HL candle cache.
 * `throttleSequential` uses the same `getCandles` calls as the parallel path (1m vs 1h identical), only serialized to respect rate limits during full-universe scans.
 */
export async function fetchMtfCandleBundle(
  coin: string,
  limit: number,
  intervals: readonly string[] = UNIVERSAL_SCAN_TIMEFRAMES,
  opts?: { throttleSequential?: boolean },
): Promise<Record<string, HyperliquidCandle[]>> {
  const end = Date.now();
  const ivs = intervals.length > 0 ? intervals : [...UNIVERSAL_SCAN_TIMEFRAMES];

  if (opts?.throttleSequential) {
    const out: Record<string, HyperliquidCandle[]> = {};
    for (const interval of ivs) {
      const ms = INTERVAL_MS[interval] ?? 60_000;
      const start = end - ms * limit - ms * 2;
      out[interval] = await getCandles(coin, interval, start, end, limit);
    }
    return out;
  }

  const entries = await Promise.all(
    ivs.map((interval) =>
      candleFetchLimit(async () => {
        const ms = INTERVAL_MS[interval] ?? 60_000;
        const start = end - ms * limit - ms * 2;
        const candles = await getCandles(coin, interval, start, end, limit);
        return [interval, candles] as const;
      }),
    ),
  );
  return Object.fromEntries(entries);
}

export async function analyzeEducationalUniversal(
  coin: string,
  timeframe: string,
  candles: HyperliquidCandle[],
  mtfBundle?: Record<string, HyperliquidCandle[]>,
): Promise<EducationalPatternSignal | null> {
  if (candles.length < PATTERN_SCAN_CANDLE_LIMIT) return null;
  const currentSMA = calculateSMAFromCandles(candles);
  if (!currentSMA) return null;

  const apexResult = runApexGeometricFlagScan(candles, timeframe);

  const { bias: marketBias, label: marketBiasLabel } = inferMarketBias(candles);
  const prev = candles.slice(0, -5);
  const prevSma = calculateSMAFromCandles(prev);
  const crossover = detectCrossover(currentSMA, prevSma);

  const candMap = new Map<string, { p: DetectedPattern; volumeOk: boolean }>();
  const base = collectPatternCandidates(candles, timeframe, { skipFlags: true });
  sortPatternCandidatesByActionability(base);
  for (const p of base) upsertByScore(candMap, { p, volumeOk: false }, marketBias);

  if (apexResult.pattern) {
    upsertByScore(candMap, { p: apexResult.pattern, volumeOk: true }, marketBias);
  }

  const hs = detectHeadAndShoulders(candles);
  const ihs = detectInverseHeadAndShoulders(candles);
  if (hs) upsertByScore(candMap, { p: hs, volumeOk: false }, marketBias);
  if (ihs) upsertByScore(candMap, { p: ihs, volumeOk: false }, marketBias);

  const merged = [...candMap.values()];
  if (merged.length === 0) {
    if (!crossover) return null;
    const crossBias = crossover === "bullish_crossover" ? "bullish" : "bearish";
    const price = currentSMA.price;
    const crossoverTradeable =
      crossover === "bullish_crossover"
        ? price > currentSMA.sma21 && price > currentSMA.sma200
        : price < currentSMA.sma21 && price < currentSMA.sma200;
    return {
      id: `${coin}-${timeframe}-${Date.now()}`,
      coin,
      timeframe,
      bias: crossBias,
      patternName: `21/200 SMMA ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"} Crossover`,
      patternStatus: "developed",
      sma21: currentSMA.sma21,
      sma200: currentSMA.sma200,
      currentPrice: price,
      smaRelationship: `${marketBiasLabel} Fresh crossover on this timeframe.`,
      educationalNote: buildDynamicEducation(
        "SMA crossover",
        timeframe,
        crossBias,
        false,
        true,
        "developed",
        marketBiasLabel,
      ).educationalNote,
      whatToWatch: buildDynamicEducation(
        "SMA crossover",
        timeframe,
        crossBias,
        false,
        true,
        "developed",
        marketBiasLabel,
      ).whatToWatch,
      detectedAt: new Date(),
      tradeable: crossoverTradeable,
      maFilterReason: crossoverTradeable
        ? "Price confirms the crossover side of both SMMAs."
        : "Crossover printed; wait for price to hold the directional side of 21/200.",
      marketBiasLabel,
      apexEngineNote: apexResult.note,
      apexScanState: apexResult.scanState,
      apexTier: "no_pattern_apex",
    };
  }

  merged.sort(
    (a, b) => scoreCandidate(b.p, marketBias, b.volumeOk) - scoreCandidate(a.p, marketBias, a.volumeOk),
  );
  const best = merged[0]!;
  const structural = getPatternStructuralBias(best.p);
  const counterTrend =
    (marketBias === "bullish" && structural === "bearish") ||
    (marketBias === "bearish" && structural === "bullish");

  const patternStatus: EducationalPatternSignal["patternStatus"] =
    best.p.status === "breakout_confirmed"
      ? "developed"
      : best.p.status === "breakout_pending"
        ? "breakout_watch"
        : "forming";

  const { educationalNote, whatToWatch } = buildDynamicEducation(
    best.p.displayName,
    timeframe,
    structural,
    counterTrend,
    best.volumeOk,
    patternStatus,
    marketBiasLabel,
  );

  const patternName = counterTrend ? `${best.p.displayName} (Counter-Trend)` : best.p.displayName;
  const bias =
    structural === "bullish" ? "bullish" : structural === "bearish" ? "bearish" : mapMarketToSignalBias(marketBias);

  const price = currentSMA.price;
  const { sma21: s21, sma200: s200 } = currentSMA;
  let tradeable = false;
  let maFilterReason = "";
  if (structural === "bullish") {
    tradeable = price > s21 && price > s200;
    maFilterReason = tradeable
      ? "Price above both 21 and 200 SMMA — aligned with bullish structure."
      : "Bullish geometry but price not above both SMMAs — secondary until reclaim.";
  } else if (structural === "bearish") {
    tradeable = price < s21 && price < s200;
    maFilterReason = tradeable
      ? "Price below both 21 and 200 SMMA — aligned with bearish structure."
      : "Bearish geometry but price not below both SMMAs — wait for confirmation.";
  } else {
    tradeable = false;
    maFilterReason = "Neutral pattern — use SMMA + higher timeframe for direction.";
  }

  const smaRelationship = `${marketBiasLabel} Pattern: ${best.p.displayName}.`;

  let apexTier: EducationalPatternSignal["apexTier"] = apexResult.pattern ? "standard" : "no_pattern_apex";
  if (apexResult.pattern?.name === "bull_flag") {
    if (timeframe === "1m" && mtfBundle && is15mTrendBullish(mtfBundle)) {
      apexTier = "high_probability_trend_aligned";
    } else if (
      (timeframe === "1h" || timeframe === "4h") &&
      currentSMA.sma21 > currentSMA.sma200 * 1.0001
    ) {
      apexTier = "high_probability_trend_aligned";
    }
  } else if (apexResult.pattern?.name === "bear_flag") {
    if (timeframe === "1m" && mtfBundle && is15mTrendBearish(mtfBundle)) {
      apexTier = "high_probability_trend_aligned";
    } else if (
      (timeframe === "1h" || timeframe === "4h") &&
      currentSMA.sma21 < currentSMA.sma200 * 0.9999
    ) {
      apexTier = "high_probability_trend_aligned";
    }
  }

  const apexPrefix =
    apexTier === "high_probability_trend_aligned"
      ? "High Probability — Trend Aligned (1m flag × 15m SMMA). "
      : "";

  return {
    id: `${coin}-${timeframe}-${Date.now()}`,
    coin,
    timeframe,
    bias,
    patternName,
    patternStatus,
    sma21: s21,
    sma200: s200,
    currentPrice: price,
    smaRelationship: apexPrefix + smaRelationship,
    educationalNote: apexResult.pattern
      ? `${apexPrefix}${apexResult.note} ${educationalNote}`
      : educationalNote,
    whatToWatch,
    detectedAt: new Date(),
    tradeable,
    maFilterReason,
    counterTrend,
    volumeConfirmed: best.volumeOk,
    marketBiasLabel,
    apexEngineNote: apexResult.note,
    apexScanState: apexResult.scanState,
    apexTier,
  };
}

type CoinScanDiagnostics = {
  coin: string;
  len1m: number;
  candle1mLastTs?: number;
};

async function scanOneCoinMtf(
  coin: string,
  timeframes: string[],
): Promise<{ signals: EducationalPatternSignal[]; diag: CoinScanDiagnostics }> {
  const orderedTf = prioritizeScanTimeframes(timeframes);
  const intervals = intervalsForPatternScan(orderedTf);
  const bundle = await fetchMtfCandleBundle(
    coin,
    PATTERN_SCAN_CANDLE_LIMIT,
    intervals,
    { throttleSequential: true },
  );
  const m1 = bundle["1m"] || [];
  const lastTs = m1.length > 0 ? m1[m1.length - 1]!.t : undefined;
  const diag: CoinScanDiagnostics = { coin, len1m: m1.length, candle1mLastTs: lastTs };

  const tfLimit = pLimit(9);
  const tasks = orderedTf.map(
    (tf) => () =>
      bundle[tf] && bundle[tf]!.length >= PATTERN_SCAN_CANDLE_LIMIT
        ? analyzeEducationalUniversal(coin, tf, bundle[tf]!, bundle)
        : Promise.resolve(null),
  );
  const results = await Promise.all(tasks.map((fn) => tfLimit(fn)));
  const signals = results.filter((x): x is EducationalPatternSignal => x != null);
  return { signals, diag };
}

export interface PatternScanMeta {
  coinCount: number;
  durationMs: number;
  signalCount: number;
}

/**
 * Multi-coin scan: queue tickers in batches (5 every 2s) so Hyperliquid rate limits are not tripped on 1m/5m.
 * Every timeframe uses the same `getCandles` path as higher TFs (`fetchMtfCandleBundle` with `throttleSequential`).
 */
export async function scanForEducationalPatterns(
  coins: string[],
  timeframes: string[] = [...UNIVERSAL_SCAN_TIMEFRAMES],
): Promise<{ patterns: EducationalPatternSignal[]; meta: PatternScanMeta }> {
  const uniqueTf = prioritizeScanTimeframes(
    timeframes.filter(Boolean).length > 0 ? timeframes : [...UNIVERSAL_SCAN_TIMEFRAMES],
  );

  const monitoring = getScannerHealthMonitoringEnabled();
  const startedAt = Date.now();
  const healthErrors: ScannerHealthErrorRow[] = [];
  let gold1mLagMs: number | null = null;
  let alt1mThinOrEmpty = 0;
  const wants1m = uniqueTf.includes("1m");

  const flat: EducationalPatternSignal[] = [];
  const batches = chunkArray(coins, GLOBAL_SCANNER_BATCH_SIZE);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!;
    const batchSignals = await Promise.all(
      batch.map(async (coin) => {
        try {
          const { signals, diag } = await scanOneCoinMtf(coin, uniqueTf);
          if (monitoring && wants1m) {
            if (diag.len1m < PATTERN_SCAN_CANDLE_LIMIT && coin !== "BTC") {
              alt1mThinOrEmpty++;
            }
            if (diag.candle1mLastTs != null) {
              const lag = Date.now() - diag.candle1mLastTs;
              if (isGoldScannerTicker(coin)) {
                if (gold1mLagMs === null || lag > gold1mLagMs) gold1mLagMs = lag;
              }
            } else if (isGoldScannerTicker(coin)) {
              healthErrors.push({ coin, phase: "1m", message: "No 1m candles returned" });
            }
          }
          return signals;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (monitoring) {
            healthErrors.push({ coin, phase: "scan", message: msg });
          }
          console.error(`[pattern-scan] ${coin}:`, e);
          return [] as EducationalPatternSignal[];
        }
      }),
    );
    flat.push(...batchSignals.flat());
    if (bi < batches.length - 1) {
      await sleep(GLOBAL_SCANNER_BATCH_DELAY_MS);
    }
  }

  if (monitoring) {
    finalizeScannerHealthRun({
      startedAt,
      timeframes: uniqueTf,
      totalCoinsPlanned: coins.length,
      coinsCompleted: coins.length,
      signalsEmitted: flat.length,
      errors: healthErrors,
      gold1mLagMs,
      alt1mThinOrEmpty,
    });
  }

  flat.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  const durationMs = Date.now() - startedAt;
  return {
    patterns: flat,
    meta: { coinCount: coins.length, durationMs, signalCount: flat.length },
  };
}
