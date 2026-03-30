/**
 * Universal pattern engine (Equilibrium): MTF candles, full pattern library + Apex + H&S,
 * **unfiltered geometry** (SMMA is advisory on each signal, not a veto). See `MultiPatternEngine.ts`.
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
  isFastTrackTimeframe,
  type ScannerHealthErrorRow,
} from "./global-scanner";
import {
  PATTERN_SCAN_MIN_BARS,
  patternScanCandleLimitForInterval,
} from "./scanner-controller";
import {
  calculateSMAFromCandles,
  detectCrossover,
  getPatternStructuralBias,
  type DetectedPattern,
} from "./sma-detection";
import { type ApexGeometricResult } from "./ApexDetectionEngine";
import { gatherMultiPatternCandidates } from "./MultiPatternEngine";
import { findPivotHighsLows } from "./pattern-shoulders";

export { findPivotHighsLows, detectHeadAndShoulders, detectInverseHeadAndShoulders } from "./pattern-shoulders";
export { detectStrictFlagWithVolume } from "./pattern-strict-volume";

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

/** Parallel HL candle fetches — global batching + stagger between coins still applies. */
const candleFetchLimit = pLimit(28);

/**
 * Candle intervals for the requested scan TFs only (not always all nine).
 * Order: 1m → 5m → … so HL fetches prioritize short TFs.
 */
function intervalsForPatternScan(timeframes: string[]): readonly string[] {
  const set = new Set(timeframes.filter(Boolean));
  if (set.size === 0) return [...UNIVERSAL_SCAN_TIMEFRAMES];
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

function mapMarketToSignalBias(mb: MarketBias): "bullish" | "bearish" | "neutral" {
  if (mb === "bullish") return "bullish";
  if (mb === "bearish") return "bearish";
  return "neutral";
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

function buildEducationalSignalFromCandidate(
  coin: string,
  timeframe: string,
  currentSMA: NonNullable<ReturnType<typeof calculateSMAFromCandles>>,
  row: { p: DetectedPattern; volumeOk: boolean },
  marketBias: MarketBias,
  marketBiasLabel: string,
  apexResult: ApexGeometricResult,
  idSalt: number,
): EducationalPatternSignal {
  const best = row;
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
  const tradeable = true;
  let maFilterReason = "";
  if (structural === "bullish") {
    const aligned = price > s21 && price > s200;
    maFilterReason = aligned
      ? "Pattern shown — price above both 21/200 SMMA (context aligns)."
      : "Pattern shown — geometry is valid; SMMA is advisory (price not above both MAs).";
  } else if (structural === "bearish") {
    const aligned = price < s21 && price < s200;
    maFilterReason = aligned
      ? "Pattern shown — price below both 21/200 SMMA (context aligns)."
      : "Pattern shown — geometry is valid; SMMA is advisory (price not below both MAs).";
  } else {
    maFilterReason = "Neutral geometry — use SMMA and higher timeframe for direction.";
  }

  const smaRelationship = `${marketBiasLabel} Pattern: ${best.p.displayName}.`;
  const sameApex = !!(apexResult.pattern && best.p.name === apexResult.pattern.name);

  let apexTier: EducationalPatternSignal["apexTier"] = apexResult.pattern ? "standard" : "no_pattern_apex";
  if (sameApex && apexResult.pattern) {
    const poleStrong = (apexResult.poleMovePct ?? 0) >= (timeframe === "1m" || timeframe === "3m" || timeframe === "5m" ? 0.35 : 0.9);
    const actionable =
      apexResult.pattern.status === "breakout_confirmed" || apexResult.pattern.status === "breakout_pending";
    if (poleStrong && actionable) {
      apexTier = "high_probability_trend_aligned";
    }
  }

  const apexPrefix =
    apexTier === "high_probability_trend_aligned"
      ? "High Probability — Apex pole + flag geometry (not SMMA-filtered). "
      : "";

  const apexNoteForRow = sameApex ? apexResult.note : "";

  return {
    id: `${coin}-${timeframe}-${best.p.name}-${idSalt}-${Date.now()}`,
    coin,
    timeframe,
    bias,
    patternName,
    patternStatus,
    sma21: s21,
    sma200: s200,
    currentPrice: price,
    smaRelationship: apexPrefix + smaRelationship,
    educationalNote: apexNoteForRow ? `${apexPrefix}${apexNoteForRow} ${educationalNote}` : educationalNote,
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

/**
 * Fresh last-`limit` candles per interval; explicit start/end bypasses HL candle cache.
 * `throttleSequential` uses the same `getCandles` calls as the parallel path (1m vs 1h identical), only serialized to respect rate limits during full-universe scans.
 */
export async function fetchMtfCandleBundle(
  coin: string,
  limit: number | ((interval: string) => number),
  intervals: readonly string[] = UNIVERSAL_SCAN_TIMEFRAMES,
  opts?: { throttleSequential?: boolean },
): Promise<Record<string, HyperliquidCandle[]>> {
  const end = Date.now();
  const ivs = intervals.length > 0 ? intervals : [...UNIVERSAL_SCAN_TIMEFRAMES];
  const resolveLimit = (interval: string) =>
    typeof limit === "function" ? limit(interval) : limit;

  if (opts?.throttleSequential) {
    const out: Record<string, HyperliquidCandle[]> = {};
    for (const interval of ivs) {
      const lim = resolveLimit(interval);
      const ms = INTERVAL_MS[interval] ?? 60_000;
      const start = end - ms * lim - ms * 2;
      out[interval] = await getCandles(coin, interval, start, end, lim);
    }
    return out;
  }

  const entries = await Promise.all(
    ivs.map((interval) =>
      candleFetchLimit(async () => {
        const lim = resolveLimit(interval);
        const ms = INTERVAL_MS[interval] ?? 60_000;
        const start = end - ms * lim - ms * 2;
        const candles = await getCandles(coin, interval, start, end, lim);
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
): Promise<EducationalPatternSignal[]> {
  // Must match `scanOneCoinMtf` gate. Shorter TFs only fetch up to 320 bars
  // (`patternScanCandleLimitForInterval`); requiring 400 here zeroed all fast-TF signals.
  if (candles.length < PATTERN_SCAN_MIN_BARS) return [];
  const currentSMA = calculateSMAFromCandles(candles);
  if (!currentSMA) return [];

  const { bias: marketBias, label: marketBiasLabel } = inferMarketBias(candles);
  const prev = candles.slice(0, -5);
  const prevSma = calculateSMAFromCandles(prev);
  const crossover = detectCrossover(currentSMA, prevSma);

  const { rows, apexResult } = gatherMultiPatternCandidates(candles, timeframe);

  if (rows.length === 0) {
    if (!crossover) return [];
    const crossBias = crossover === "bullish_crossover" ? "bullish" : "bearish";
    const price = currentSMA.price;
    const crossoverTradeable = true;
    const ed = buildDynamicEducation(
      "SMA crossover",
      timeframe,
      crossBias,
      false,
      true,
      "developed",
      marketBiasLabel,
    );
    return [
      {
        id: `${coin}-${timeframe}-cross-${Date.now()}`,
        coin,
        timeframe,
        bias: crossBias,
        patternName: `21/200 SMMA ${crossover === "bullish_crossover" ? "Bullish" : "Bearish"} Crossover`,
        patternStatus: "developed",
        sma21: currentSMA.sma21,
        sma200: currentSMA.sma200,
        currentPrice: price,
        smaRelationship: `${marketBiasLabel} Fresh crossover on this timeframe.`,
        educationalNote: ed.educationalNote,
        whatToWatch: ed.whatToWatch,
        detectedAt: new Date(),
        tradeable: crossoverTradeable,
        maFilterReason:
          crossover === "bullish_crossover"
            ? price > currentSMA.sma21 && price > currentSMA.sma200
              ? "Crossover shown — price above both 21/200 SMMA (context aligns)."
              : "Crossover shown — geometry/regime event; SMMA position is advisory only."
            : price < currentSMA.sma21 && price < currentSMA.sma200
              ? "Crossover shown — price below both 21/200 SMMA (context aligns)."
              : "Crossover shown — geometry/regime event; SMMA position is advisory only.",
        marketBiasLabel,
        apexEngineNote: apexResult.note,
        apexScanState: apexResult.scanState,
        apexTier: "no_pattern_apex",
      },
    ];
  }

  return rows.map((row, i) =>
    buildEducationalSignalFromCandidate(
      coin,
      timeframe,
      currentSMA,
      row,
      marketBias,
      marketBiasLabel,
      apexResult,
      i,
    ),
  );
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
  const fastIvs = intervals.filter((iv) => isFastTrackTimeframe(iv));
  const slowIvs = intervals.filter((iv) => !isFastTrackTimeframe(iv));
  const [fastBundle, slowBundle] = await Promise.all([
    fastIvs.length > 0
      ? fetchMtfCandleBundle(coin, patternScanCandleLimitForInterval, fastIvs, {
          throttleSequential: false,
        })
      : Promise.resolve({} as Record<string, HyperliquidCandle[]>),
    slowIvs.length > 0
      ? fetchMtfCandleBundle(coin, patternScanCandleLimitForInterval, slowIvs, {
          throttleSequential: false,
        })
      : Promise.resolve({} as Record<string, HyperliquidCandle[]>),
  ]);
  const bundle: Record<string, HyperliquidCandle[]> = { ...slowBundle, ...fastBundle };
  const m1 = bundle["1m"] || [];
  const lastTs = m1.length > 0 ? m1[m1.length - 1]!.t : undefined;
  const diag: CoinScanDiagnostics = { coin, len1m: m1.length, candle1mLastTs: lastTs };

  const tfLimit = pLimit(9);
  const tasks = orderedTf.map(
    (tf) => () =>
      bundle[tf] && bundle[tf]!.length >= PATTERN_SCAN_MIN_BARS
        ? analyzeEducationalUniversal(coin, tf, bundle[tf]!)
        : Promise.resolve([] as EducationalPatternSignal[]),
  );
  const results = await Promise.all(tasks.map((fn) => tfLimit(fn)));
  const signals = results.flat();
  return { signals, diag };
}

export interface PatternScanMeta {
  coinCount: number;
  durationMs: number;
  signalCount: number;
}

/**
 * Multi-coin scan: staggered batches (see `GlobalScanner`). Per coin, fast (1m/3m/5m) and slow intervals fetch in parallel.
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
            if (diag.len1m < PATTERN_SCAN_MIN_BARS && coin !== "BTC") {
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
