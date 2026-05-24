import { useEffect, useRef, useState, memo, useCallback, useMemo } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet-context";
import { useTrading } from "@/lib/trading-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { ChartOrderLines } from "@/components/chart-order-lines";
import {
  ChartDrawingProvider,
  ChartDrawingLeftToolbar,
  ChartDrawingCanvas,
  ChartDrawingInteractionLayer,
} from "@/components/chart-drawing-overlay";
import { ChartCandleCountdown } from "@/components/chart-candle-countdown";
import { cn } from "@/lib/utils";
import { ApexSovereign } from "@/components/apex-sovereign";
import { selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import { PremiumFeatureLock } from "@/components/premium-feature-lock";
import { loadCachedCandles, saveCachedCandles } from "@/lib/chart-candle-storage";
import { chartCandlePollMs } from "@/lib/chart-candle-poll";
import { mergeHlCandleIntoSeries, subscribeHyperliquidCandles } from "@/lib/hyperliquid-candle-ws";
import { computeSmmaSeries } from "@/lib/smma-worker-client";

interface EducationalPatternSignal {
  id: string;
  coin: string;
  coinDisplay?: string;
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
  detectedAt: string;
  tradeable: boolean;
  maFilterReason: string;
  counterTrend?: boolean;
  volumeConfirmed?: boolean;
  marketBiasLabel?: string;
  apexTier?: "high_probability_trend_aligned" | "standard" | "no_pattern_apex";
}

interface PatternChartProps {
  symbol: string;
  interval?: string;
  className?: string;
  currentPrice?: number;
  /** When true, fetches educational patterns for this symbol/timeframe and shows the top-left alert card (Pro). */
  patternScanEnabled?: boolean;
  /** When true, shows left draw toolbar + persisted pattern sketches (bull flag, lines, zones). */
  drawingEnabled?: boolean;
  hideIndicators?: boolean;
  /** Blur RSI/Stoch stack with Pro CTA (non-subscribers can still use the main candle pane). */
  lockPremiumIndicatorStack?: boolean;
}

interface CandleData {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v: number | string;
}

const BG = "#131722";
const BG_IND = "#1b2035";
const GRID = "#1e2535";
const BORDER = "#2a3249";
const TEXT = "#b2b5be";
const HANDLE_PX = 6;
const DEFAULT_VISIBLE_BARS = 120;
/** Empty space to the right of the last candle (keep small to avoid SMMA lines drawing into a void). */
const CHART_FUTURE_BAR_PADDING = 2;
const CHART_HISTORY_LIMITS: Record<string, number> = {
  "1m": 2500,
  "3m": 3000,
  "5m": 3000,
  "15m": 4000,
  "30m": 5000,
  "1h": 5000,
  "2h": 5000,
  "4h": 5000,
  "1d": 5000,
};

function calcSMA(vals: number[], times: Time[], period: number): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < vals.length; i++) {
    let s = 0;
    for (let j = 0; j < period; j++) s += vals[i - j];
    out.push({ time: times[i], value: s / period });
  }
  return out;
}

function calcRSI(closes: number[], times: Time[], period = 14): { time: Time; value: number }[] {
  if (closes.length < period + 1) return [];
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  const out: { time: Time; value: number }[] = [];
  out.push({ time: times[period], value: 100 - 100 / (1 + (al === 0 ? 100 : ag / al)) });
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    out.push({ time: times[i], value: 100 - 100 / (1 + (al === 0 ? 100 : ag / al)) });
  }
  return out;
}

function calcStochRSI(rsi: { time: Time; value: number }[], period = 14, ks = 3, ds = 3) {
  if (rsi.length < period) return { k: [] as { time: Time; value: number }[], d: [] as { time: Time; value: number }[] };
  const raw: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < rsi.length; i++) {
    const sl = rsi.slice(i - period + 1, i + 1).map(x => x.value);
    const mn = Math.min(...sl), mx = Math.max(...sl);
    raw.push({ time: rsi[i].time, value: mx === mn ? 50 : ((rsi[i].value - mn) / (mx - mn)) * 100 });
  }
  const k: { time: Time; value: number }[] = [];
  for (let i = ks - 1; i < raw.length; i++) {
    k.push({ time: raw[i].time, value: raw.slice(i - ks + 1, i + 1).reduce((a, x) => a + x.value, 0) / ks });
  }
  const d: { time: Time; value: number }[] = [];
  for (let i = ds - 1; i < k.length; i++) {
    d.push({ time: k[i].time, value: k.slice(i - ds + 1, i + 1).reduce((a, x) => a + x.value, 0) / ds });
  }
  return { k, d };
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

function normalizeCandlesByTime(candles: CandleData[]): CandleData[] {
  const latestByTime = new Map<number, CandleData>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.t)) continue;
    latestByTime.set(candle.t, candle);
  }
  return [...latestByTime.values()].sort((a, b) => a.t - b.t);
}

function fingerprintCandles(candles: CandleData[]): string {
  if (candles.length === 0) return "empty";
  const last = candles[candles.length - 1]!;
  return `${candles.length}:${last.t}:${last.o}:${last.h}:${last.l}:${last.c}:${last.v}`;
}

function candlesStructurallyEqual(a: CandleData[] | undefined, b: CandleData[] | undefined): boolean {
  if (!a || !b) return a === b;
  return fingerprintCandles(a) === fingerprintCandles(b);
}

type SmmaPoint = { time: Time; value: number };

function trimLineSeriesToTime<T extends { time: Time }>(points: T[], lastTime: Time): T[] {
  if (points.length === 0) return points;
  let end = points.length;
  while (end > 0 && points[end - 1]!.time > lastTime) end--;
  return end === points.length ? points : points.slice(0, end);
}

function applySmmaToChart(
  series21: ISeriesApi<"Line"> | null,
  series200: ISeriesApi<"Line"> | null,
  sma21: SmmaPoint[],
  sma200: SmmaPoint[],
  lastTime: Time,
  candleCount: number,
  mode: "full" | "tail",
): void {
  if (!series21 || !series200) return;
  const s21 = trimLineSeriesToTime(sma21, lastTime);
  const s200 = trimLineSeriesToTime(sma200, lastTime);

  if (candleCount < 21) {
    series21.setData([]);
  } else if (s21.length > 0) {
    if (mode === "full") series21.setData(s21);
    else series21.update(s21[s21.length - 1]!);
  }

  if (candleCount < 200) {
    series200.setData([]);
  } else if (s200.length > 0) {
    if (mode === "full") series200.setData(s200);
    else series200.update(s200[s200.length - 1]!);
  }
}

function visibleLogicalRangeForBarCount(barCount: number, preferredBars: number | null) {
  const visibleBars = Math.max(
    20,
    Math.min(barCount, preferredBars ?? DEFAULT_VISIBLE_BARS),
  );
  const rightEdge = barCount - 1 + CHART_FUTURE_BAR_PADDING;
  return {
    from: Math.max(-0.5, rightEdge - visibleBars),
    to: rightEdge,
  };
}

function rankPatternStatus(status: EducationalPatternSignal["patternStatus"]): number {
  if (status === "developed") return 3;
  if (status === "breakout_watch") return 2;
  return 1;
}

function rankApexTier(tier?: EducationalPatternSignal["apexTier"]): number {
  if (tier === "high_probability_trend_aligned") return 2;
  if (tier === "standard") return 1;
  return 0;
}

function getPatternStatusPresentation(status: EducationalPatternSignal["patternStatus"]): {
  label: string;
  className: string;
} {
  if (status === "forming") {
    return { label: "FORMING", className: "bg-blue-800" };
  }
  if (status === "breakout_watch") {
    return { label: "WATCH", className: "bg-amber-800 text-amber-100" };
  }
  return { label: "DEVELOPED", className: "bg-emerald-800" };
}

function buildLiveSmmaReason(
  signal: EducationalPatternSignal,
  smaStatus: { sma21: number; sma200: number; isBullish: boolean } | null,
  livePrice: number | null,
): string {
  if (!smaStatus || livePrice == null || !Number.isFinite(livePrice)) {
    return signal.maFilterReason;
  }

  if (signal.bias === "bullish") {
    const aligned = livePrice > smaStatus.sma21 && livePrice > smaStatus.sma200;
    return aligned
      ? "Live chart context aligns: price is above the chart's 21/200 SMMA."
      : "Live chart context is mixed: bullish geometry is present, but price is not above both chart SMMAs.";
  }
  if (signal.bias === "bearish") {
    const aligned = livePrice < smaStatus.sma21 && livePrice < smaStatus.sma200;
    return aligned
      ? "Live chart context aligns: price is below the chart's 21/200 SMMA."
      : "Live chart context is mixed: bearish geometry is present, but price is not below both chart SMMAs.";
  }
  return "Live chart context is neutral: use the 21/200 SMMA and higher timeframe for direction.";
}

function normalizePatternCoinKey(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/^BINANCE:/i, "")
    .replace(/USDT$/i, "")
    .replace(/-PERP$/i, "")
    .trim()
    .toUpperCase();
}

function patternScanAuthHeaders(wallet: string | null | undefined): HeadersInit {
  if (!wallet?.trim()) return {};
  const w = wallet.trim();
  return { "x-wallet-address": w, Authorization: `Bearer ${w}` };
}

function selectBestSignal(
  signals: EducationalPatternSignal[] | undefined,
  coin: string,
  interval: string,
): EducationalPatternSignal | null {
  if (!signals?.length) return null;

  const coinKey = normalizePatternCoinKey(coin);
  const intervalKey = interval.trim();
  const matches = signals.filter(
    (signal) =>
      normalizePatternCoinKey(signal.coin) === coinKey && signal.timeframe === intervalKey,
  );
  if (matches.length === 0) return null;

  return [...matches].sort((a, b) => {
    const statusDiff = rankPatternStatus(b.patternStatus) - rankPatternStatus(a.patternStatus);
    if (statusDiff !== 0) return statusDiff;

    const apexDiff = rankApexTier(b.apexTier) - rankApexTier(a.apexTier);
    if (apexDiff !== 0) return apexDiff;

    const volumeDiff = Number(Boolean(b.volumeConfirmed)) - Number(Boolean(a.volumeConfirmed));
    if (volumeDiff !== 0) return volumeDiff;

    const trendDiff = Number(Boolean(a.counterTrend)) - Number(Boolean(b.counterTrend));
    if (trendDiff !== 0) return trendDiff;

    const detectedAtDiff = new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    if (detectedAtDiff !== 0) return detectedAtDiff;

    return a.patternName.localeCompare(b.patternName);
  })[0] ?? null;
}

function PatternChartComponent({
  symbol = "BTC",
  interval = "5m",
  className = "",
  currentPrice = 0,
  patternScanEnabled = false,
  drawingEnabled = false,
  hideIndicators = false,
  lockPremiumIndicatorStack = false,
}: PatternChartProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const chartPaneRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const stochContainerRef = useRef<HTMLDivElement>(null);

  const mainChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const stochChartRef = useRef<IChartApi | null>(null);

  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sma21SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const volumeSmaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const isSyncingRef = useRef(false);
  const preferredVisibleBarsRef = useRef<number | null>(null);
  const smaCardRunRef = useRef(0);
  const chartSmmaRunRef = useRef(0);
  const lastChartFingerprintRef = useRef("");
  const layoutTickRafRef = useRef(0);
  const visibleRangeCacheRef = useRef<{ min: number; max: number } | null>(null);

  /** Keeps optimistic TP/SL prices until openOrders refresh (Apex Sovereign + order lines contract). */
  const [nativeTpslOverride, setNativeTpslOverride] = useState<{ tp: number | null; sl: number | null }>({
    tp: null,
    sl: null,
  });

  // Tracking state for smart setData vs update()
  // Key combines coin + interval so any change to either triggers a full reload
  const prevDataKeyRef = useRef<string>("");
  const prevCandlesLenRef = useRef<number>(0);
  const prevLastTimeRef = useRef<number>(0);
  const chartDataReadyRef = useRef<boolean>(false); // true once setData called with real data
  // Incremented each time the chart is (re)created — causes the data effect to re-run even
  // when candles/coin/interval haven't changed, so the fresh chart always gets populated.
  const [chartVersion, setChartVersion] = useState(0);
  const [visiblePriceRange, setVisiblePriceRange] = useState<{ min: number; max: number } | null>(null);
  /** Bumps on throttled chart interaction so Apex Sovereign SVG resyncs after Y-scale changes. */
  const [chartLayoutTick, setChartLayoutTick] = useState(0);
  const [tpslDragging, setTpslDragging] = useState(false);

  // Pane resize state
  const [weights, setWeights] = useState([6, 2, 2]);
  const [lastVol, setLastVol] = useState<number | null>(null);
  const [lastRSI, setLastRSI] = useState<number | null>(null);
  const [lastK, setLastK] = useState<number | null>(null);
  const [lastD, setLastD] = useState<number | null>(null);
  const [smaStatus, setSmaStatus] = useState<{ sma21: number; sma200: number; isBullish: boolean } | null>(null);
  const [activeSignal, setActiveSignal] = useState<EducationalPatternSignal | null>(null);
  const [lastRenderedDataKey, setLastRenderedDataKey] = useState<string>("");
  const [noDataRetryCounts, setNoDataRetryCounts] = useState<Record<string, number>>({});

  const { theme } = useTheme();
  const { address } = useWallet();
  const { positions, openOrders } = useTrading();
  const queryClient = useQueryClient();
  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  // Pre-warm all timeframes on the server in parallel when coin changes
  // so that switching timeframes is instant (data is already cached server-side)
  useEffect(() => {
    fetch(`/api/hyperliquid/candles/${coin}/prewarm`, { method: "POST" }).catch(() => {});
    // Also prime the React Query cache for all timeframes
    const ALL_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];
    ALL_INTERVALS.forEach((tf) => {
      if (tf === interval) return;
      const limit = CHART_HISTORY_LIMITS[tf] ?? 3000;
      const key = `/api/hyperliquid/candles/${coin}?interval=${tf}&limit=${limit}`;
      queryClient.prefetchQuery({
        queryKey: [key],
        staleTime: 30000,
      });
    });
  }, [coin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset indicator stats and mark chart as needing a full reload when symbol OR interval changes.
  // Do NOT call setData([]) here — keep old candles visible until new ones arrive.
  useEffect(() => {
    chartDataReadyRef.current = false;
    prevDataKeyRef.current = "";
    lastChartFingerprintRef.current = "";
    preferredVisibleBarsRef.current = null;
    setLastVol(null);
    setLastRSI(null);
    setLastK(null);
    setLastD(null);
    setSmaStatus(null);
    setActiveSignal(null);
  }, [coin, interval]);

  const historyLimit = CHART_HISTORY_LIMITS[interval] ?? 3000;
  const candlePollMs = chartCandlePollMs(interval);
  const candleQueryKey = `/api/hyperliquid/candles/${coin}?interval=${interval}&limit=${historyLimit}&fresh=1`;
  const cachedCandles = useMemo(() => loadCachedCandles(coin, interval), [coin, interval]);

  const {
    data: candles,
    isLoading: candlesLoading,
    isFetching: candlesFetching,
    isError: candlesError,
    isFetched: candlesFetched,
    refetch: refetchCandles,
  } = useQuery<CandleData[]>({
    // candlesLoading kept for React Query semantics; UI uses cache-aware flags below
    queryKey: [candleQueryKey],
    /** Never reuse another market's candles while the query key changes — that caused ghost charts until refresh. */
    placeholderData: () =>
      cachedCandles.length > 0 ? (cachedCandles as CandleData[]) : undefined,
    structuralSharing: (prev, next) =>
      candlesStructurallyEqual(prev as CandleData[] | undefined, next as CandleData[] | undefined)
        ? (prev as CandleData[])
        : (next as CandleData[]),
    refetchInterval: candlePollMs,
    staleTime: Math.max(1_000, Math.floor(candlePollMs * 0.75)),
    retry: false,
    queryFn: async ({ signal }) => {
      const attempt = async () => {
        const res = await fetch(candleQueryKey, { signal, credentials: "include" });
        if (!res.ok) throw new Error(`candles ${res.status}`);
        return (await res.json()) as CandleData[];
      };
      try {
        const data = await attempt();
        saveCachedCandles(coin, interval, data);
        return data;
      } catch (first) {
        if (signal?.aborted) throw first;
        await new Promise<void>((r) => setTimeout(r, 2000));
        if (signal?.aborted) throw first;
        const data = await attempt();
        saveCachedCandles(coin, interval, data);
        return data;
      }
    },
  });

  // Live Hyperliquid `candle` WebSocket — extends wicks on the forming bar (matches HL UI).
  useEffect(() => {
    if (!coin || !interval) return;
    return subscribeHyperliquidCandles(coin, interval, (update) => {
      queryClient.setQueryData<CandleData[]>([candleQueryKey], (prev) => {
        if (!prev?.length) return prev;
        const merged = mergeHlCandleIntoSeries(prev, update);
        saveCachedCandles(coin, interval, merged);
        return merged;
      });
    });
  }, [coin, interval, candleQueryKey, queryClient]);

  const noDataRetryKey = `${coin}:${interval}`;
  const noDataRetryCount = noDataRetryCounts[noDataRetryKey] ?? 0;
  const hasRenderableCandles = (candles?.length ?? 0) > 0;
  const isRetryingEmptyCandles =
    candlesFetched &&
    !hasRenderableCandles &&
    !candlesFetching &&
    noDataRetryCount < 2;
  const showChartLoadingOverlay = (candlesFetching || isRetryingEmptyCandles) && !hasRenderableCandles;
  const showNoDataFallback =
    candlesFetched &&
    !hasRenderableCandles &&
    !candlesFetching &&
    !chartDataReadyRef.current &&
    lastRenderedDataKey !== `${coin}:${interval}` &&
    noDataRetryCount >= 2 &&
    (candlesError || !candlesLoading);

  useEffect(() => {
    setNoDataRetryCounts((prev) => (prev[noDataRetryKey] ? { ...prev, [noDataRetryKey]: 0 } : prev));
  }, [noDataRetryKey]);

  useEffect(() => {
    if (hasRenderableCandles || candlesFetching || !candlesFetched) return;
    if (noDataRetryCount >= 2) return;

    const delayMs = noDataRetryCount === 0 ? 1200 : 2500;
    const timer = window.setTimeout(() => {
      setNoDataRetryCounts((prev) => ({
        ...prev,
        [noDataRetryKey]: (prev[noDataRetryKey] ?? 0) + 1,
      }));
      void refetchCandles();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    candlesFetched,
    candlesFetching,
    hasRenderableCandles,
    noDataRetryCount,
    noDataRetryKey,
    refetchCandles,
  ]);

  const walletForPatterns = address?.trim() ?? "";
  const {
    data: signals,
    isFetching: patternsFetching,
    isError: patternsError,
    error: patternsErrorDetail,
    refetch: refetchPatterns,
  } = useQuery<EducationalPatternSignal[]>({
    queryKey: ["trade-journal-patterns", coin, interval, walletForPatterns],
    refetchInterval: patternScanEnabled && walletForPatterns ? 45_000 : false,
    enabled: patternScanEnabled && Boolean(walletForPatterns),
    queryFn: async () => {
      const u = new URL("/api/signals/patterns", window.location.origin);
      u.searchParams.set("coins", coin);
      u.searchParams.set("timeframes", interval);
      u.searchParams.set("nocache", "1");
      const res = await fetch(u.toString(), {
        credentials: "include",
        headers: patternScanAuthHeaders(walletForPatterns),
      });
      if (!res.ok) {
        const err = new Error("Failed to load chart patterns") as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as EducationalPatternSignal[];
    },
  });

  const parsePrice = useCallback((val: number | string): number =>
    typeof val === "string" ? parseFloat(val) : val, []);

  // ── Pointer drag-to-resize (mouse + touch) ──
  const startResizeDrag = useCallback((handleIdx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const container = outerRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startWeights = [...weights];
    const totalH = Math.max(1, container.clientHeight - HANDLE_PX * 2);
    const totalW = startWeights.reduce((a, b) => a + b, 0);
    const a = handleIdx;
    const b = handleIdx + 1;
    const minW = totalW * 0.07;
    const combined = startWeights[a] + startWeights[b];

    const onMove = (ev: PointerEvent) => {
      const delta = ((ev.clientY - startY) / totalH) * totalW;
      const newA = Math.max(minW, Math.min(combined - minW, startWeights[a] + delta));
      const next = [...startWeights];
      next[a] = newA;
      next[b] = combined - newA;
      setWeights(next);
    };
    const onUp = (ev: PointerEvent) => {
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [weights]);

    // ── SMA status for signal card (SMMA via worker; same venue-native formula) ──
  useEffect(() => {
    if (!candles || candles.length < 21) {
      setSmaStatus(null);
      return;
    }
    const runId = ++smaCardRunRef.current;
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    const closes = sorted.map((c) => parsePrice(c.c));
    const times = sorted.map((c) => (c.t / 1000) as Time);
    let cancelled = false;
    void computeSmmaSeries(closes, times).then((sm) => {
      if (cancelled || runId !== smaCardRunRef.current) return;
      const s = sm.smaStatus;
      if (s) setSmaStatus(s);
      else setSmaStatus(null);
    });
    return () => {
      cancelled = true;
    };
  }, [candles, parsePrice]);

  // Show ALL detected patterns — do NOT gate by MA direction here.
  // Server sets tradeable for geometric setups; card copy explains SMMA as context only.
  useEffect(() => {
    const currentSignal = selectBestSignal(signals, coin, interval);
    setActiveSignal(currentSignal ?? null);
  }, [signals, coin, interval]);

  const liveChartPrice = useMemo(() => {
    if (candles && candles.length > 0) {
      return parsePrice(candles[candles.length - 1]!.c);
    }
    if (activeSignal) return activeSignal.currentPrice;
    if (Number.isFinite(currentPrice)) return currentPrice;
    return null;
  }, [candles, activeSignal, currentPrice, parsePrice]);

  useEffect(() => {
    const chart = mainChartRef.current;
    if (!chart) return;
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !tpslDragging,
        horzTouchDrag: !tpslDragging,
        vertTouchDrag: false,
      },
    });
  }, [tpslDragging]);

  const activeSignalStatus = activeSignal ? getPatternStatusPresentation(activeSignal.patternStatus) : null;
  const liveSmmaReason = activeSignal ? buildLiveSmmaReason(activeSignal, smaStatus, liveChartPrice) : "";
  const displayedSma21 = smaStatus?.sma21 ?? activeSignal?.sma21 ?? null;
  const displayedSma200 = smaStatus?.sma200 ?? activeSignal?.sma200 ?? null;
  const smmaLabel = smaStatus ? "Live chart SMMA" : "Scanner snapshot";

  // ── Chart initialization — runs ONCE on mount, re-runs only if theme/hideIndicators changes ──
  useEffect(() => {
    if (!mainContainerRef.current) return;
    if (!hideIndicators && (!rsiContainerRef.current || !stochContainerRef.current)) return;


    const chartOpts = {
      layout: { background: { type: ColorType.Solid, color: BG }, textColor: TEXT },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: BORDER,
        autoScale: true,
        minimumWidth: 76,
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    };

    // ── Main chart ──
    const mainChart = createChart(mainContainerRef.current, {
      ...chartOpts,
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        visible: hideIndicators,
        rightOffset: CHART_FUTURE_BAR_PADDING,
        barSpacing: 8,
      },
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candleSeries;

    sma21SeriesRef.current = mainChart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 2,
      title: "SMMA 21",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    sma200SeriesRef.current = mainChart.addSeries(LineSeries, {
      color: "#f5e642",
      lineWidth: 2,
      title: "SMMA 200",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const volSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 } });
    volumeSeriesRef.current = volSeries;

    volumeSmaSeriesRef.current = mainChart.addSeries(LineSeries, {
      color: "#f59e0b", lineWidth: 1, priceScaleId: "volume",
      priceLineVisible: false, lastValueVisible: false, title: "",
    });

    const publishVisiblePriceRange = (from: number, to: number) => {
      const min = Math.min(from, to);
      const max = Math.max(from, to);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return;
      const prev = visibleRangeCacheRef.current;
      if (
        prev &&
        Math.abs(prev.min - min) / Math.max(prev.min, 1e-12) < 0.00015 &&
        Math.abs(prev.max - max) / Math.max(prev.max, 1e-12) < 0.00015
      ) {
        return;
      }
      visibleRangeCacheRef.current = { min, max };
      setVisiblePriceRange({ min, max });
    };

    const syncVisiblePriceRange = () => {
      const series = candleSeriesRef.current;
      if (!series) return;
      const range = series.priceScale().getVisibleRange();
      if (!range) return;
      publishVisiblePriceRange(range.from, range.to);
    };

    const scheduleLayoutTick = () => {
      if (layoutTickRafRef.current) return;
      layoutTickRafRef.current = requestAnimationFrame(() => {
        layoutTickRafRef.current = 0;
        setChartLayoutTick((t) => t + 1);
      });
    };

    const obs = (el: HTMLDivElement, chart: IChartApi) => {
      const ro = new ResizeObserver(() => {
        if (mainChartRef.current || rsiChartRef.current || stochChartRef.current) {
          try { chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); } catch (_) {}
          syncVisiblePriceRange();
        }
      });
      ro.observe(el);
      try { chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); } catch (_) {}
      return ro;
    };
    const r1 = obs(mainContainerRef.current!, mainChart);
    const cleanups: (() => void)[] = [];

    syncVisiblePriceRange();
    const onTimeScaleChange = () => {
      syncVisiblePriceRange();
      scheduleLayoutTick();
      const logicalRange = mainChart.timeScale().getVisibleLogicalRange();
      if (!logicalRange) return;
      const visibleBars = Math.round(logicalRange.to - logicalRange.from);
      if (Number.isFinite(visibleBars) && visibleBars >= 20) {
        preferredVisibleBarsRef.current = visibleBars;
      }
    };
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(onTimeScaleChange);
    mainChart.timeScale().subscribeVisibleTimeRangeChange(onTimeScaleChange);
    cleanups.push(() => {
      try {
        mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(onTimeScaleChange);
        mainChart.timeScale().unsubscribeVisibleTimeRangeChange(onTimeScaleChange);
      } catch (_) {}
    });

    // LW v5 has no price-scale visible-range subscription; refresh Y-range when series data changes
    // (time-axis + resize observers already call syncVisiblePriceRange).
    const onSeriesData = () => syncVisiblePriceRange();
    candleSeries.subscribeDataChanged(onSeriesData);
    cleanups.push(() => {
      try {
        candleSeries.unsubscribeDataChanged(onSeriesData);
      } catch {
        /* disposed */
      }
    });

    if (!hideIndicators && rsiContainerRef.current && stochContainerRef.current) {
      const indOpts = {
        ...chartOpts,
        layout: { background: { type: ColorType.Solid, color: BG_IND }, textColor: TEXT },
        grid: { vertLines: { color: "#252a40" }, horzLines: { color: "#252a40" } },
      };

      // ── RSI chart ──
      const rsiChart = createChart(rsiContainerRef.current, {
        ...indOpts,
        timeScale: { borderColor: BORDER, visible: false, rightOffset: 5, barSpacing: 8 },
        rightPriceScale: { borderColor: BORDER, autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: "#7b5ea7", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      rsiSeriesRef.current = rsiSeries;
      rsiSeries.createPriceLine({ price: 70, color: "rgba(255,255,255,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });
      rsiSeries.createPriceLine({ price: 50, color: "rgba(255,255,255,0.20)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", axisLabelVisible: false });
      rsiSeries.createPriceLine({ price: 30, color: "rgba(255,255,255,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });

      // ── Stoch RSI chart ──
      const stochChart = createChart(stochContainerRef.current, {
        ...indOpts,
        timeScale: { borderColor: BORDER, timeVisible: true, rightOffset: 5, barSpacing: 8 },
        rightPriceScale: { borderColor: BORDER, autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
      });
      stochChartRef.current = stochChart;

      const kSeries = stochChart.addSeries(LineSeries, {
        color: "#2962ff", lineWidth: 2, title: "K", priceLineVisible: false, lastValueVisible: true,
      });
      stochKSeriesRef.current = kSeries;

      const dSeries = stochChart.addSeries(LineSeries, {
        color: "#ff6d00", lineWidth: 2, title: "D", priceLineVisible: false, lastValueVisible: true,
      });
      stochDSeriesRef.current = dSeries;

      kSeries.createPriceLine({ price: 80, color: "rgba(255,255,255,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });
      kSeries.createPriceLine({ price: 20, color: "rgba(255,255,255,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });

      // ── Time-axis sync ──
      const sync = (src: IChartApi, targets: IChartApi[]) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const r = src.timeScale().getVisibleLogicalRange();
        if (r) targets.forEach(t => { try { t.timeScale().setVisibleLogicalRange(r); } catch (_) {} });
        isSyncingRef.current = false;
      };
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(mainChart, [rsiChart, stochChart]));
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(rsiChart, [mainChart, stochChart]));
      stochChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(stochChart, [mainChart, rsiChart]));

      const r2 = obs(rsiContainerRef.current!, rsiChart);
      const r3 = obs(stochContainerRef.current!, stochChart);
      cleanups.push(() => {
        r2.disconnect(); r3.disconnect();
        rsiSeriesRef.current = null;
        stochKSeriesRef.current = null;
        stochDSeriesRef.current = null;
        try { rsiChart.remove(); } catch (_) {}
        try { stochChart.remove(); } catch (_) {}
        rsiChartRef.current = null;
        stochChartRef.current = null;
      });
    }

    // Reset data-ready flag when chart is newly created
    chartDataReadyRef.current = false;
    prevDataKeyRef.current = "";

    // Signal the data effect that a fresh chart is ready — even if candles/coin/interval
    // haven't changed, the effect will re-run and call setData on the blank canvas.
    setChartVersion(v => v + 1);

    return () => {
      // Null series refs BEFORE removing chart so in-flight effects don't use disposed objects
      candleSeriesRef.current = null;
      sma21SeriesRef.current = null;
      sma200SeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeSmaSeriesRef.current = null;
      chartDataReadyRef.current = false;
      // Reset prevDataKeyRef so the next data effect treats incoming candles as a key change
      prevDataKeyRef.current = "";
      r1.disconnect();
      try { mainChart.remove(); } catch (_) {}
      mainChartRef.current = null;
      cleanups.forEach(fn => fn());
      if (layoutTickRafRef.current) cancelAnimationFrame(layoutTickRafRef.current);
    };
  }, [theme, hideIndicators, coin, interval]);

  // ── Data update — smart setData vs update(); SMMA computed in Web Worker (same formula) ──
  useEffect(() => {
    if (!candles || candles.length === 0) return;
    if (!candleSeriesRef.current || !mainChartRef.current) return;
    if (!sma21SeriesRef.current || !sma200SeriesRef.current) return;
    if (!volumeSeriesRef.current || !volumeSmaSeriesRef.current) return;
    if (!hideIndicators && (!rsiSeriesRef.current || !stochKSeriesRef.current || !stochDSeriesRef.current)) return;

    const sorted = normalizeCandlesByTime(candles);
    if (sorted.length === 0) return;
    const closes = sorted.map((c) => parsePrice(c.c));
    const times = sorted.map((c) => (c.t / 1000) as Time);
    const vols = sorted.map((c) => parsePrice(c.v));
    const lastCandle = sorted[sorted.length - 1]!;
    const lastTime = times[times.length - 1]!;

    const dataKey = `${coin}:${interval}`;
    const fingerprint = fingerprintCandles(sorted);
    if (
      chartDataReadyRef.current &&
      prevDataKeyRef.current === dataKey &&
      lastChartFingerprintRef.current === fingerprint
    ) {
      return;
    }

    const runId = ++chartSmmaRunRef.current;

    void (async () => {
      const sm = await computeSmmaSeries(closes, times);
      if (runId !== chartSmmaRunRef.current) return;
      if (!candleSeriesRef.current || !mainChartRef.current) return;
      if (!sma21SeriesRef.current || !sma200SeriesRef.current) return;
      if (!volumeSeriesRef.current || !volumeSmaSeriesRef.current) return;
      if (!hideIndicators && (!rsiSeriesRef.current || !stochKSeriesRef.current || !stochDSeriesRef.current)) return;

      const isKeyChange = prevDataKeyRef.current !== dataKey;
      const isFirstLoad = !chartDataReadyRef.current;

      if (isKeyChange || isFirstLoad) {
        if (isKeyChange) preferredVisibleBarsRef.current = null;

        try {
          candleSeriesRef.current.setData(
            sorted.map((c, i) => ({
              time: times[i]!,
              open: parsePrice(c.o),
              high: parsePrice(c.h),
              low: parsePrice(c.l),
              close: parsePrice(c.c),
            })),
          );

          volumeSeriesRef.current.setData(
            sorted.map((c, i) => ({
              time: times[i]!,
              value: vols[i]!,
              color: parsePrice(c.c) >= parsePrice(c.o) ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
            })),
          );
          setLastVol(vols[vols.length - 1] ?? null);

          if (vols.length >= 20) volumeSmaSeriesRef.current.setData(calcSMA(vols, times, 20));
          applySmmaToChart(
            sma21SeriesRef.current,
            sma200SeriesRef.current,
            sm.sma21,
            sm.sma200,
            lastTime,
            sorted.length,
            "full",
          );

          if (!hideIndicators && rsiSeriesRef.current && stochKSeriesRef.current && stochDSeriesRef.current) {
            const rsiData = calcRSI(closes, times, 14);
            if (rsiData.length > 0) {
              rsiSeriesRef.current.setData(rsiData);
              setLastRSI(rsiData[rsiData.length - 1]!.value);
            }
            if (rsiData.length >= 14) {
              const { k, d } = calcStochRSI(rsiData, 14, 3, 3);
              if (k.length > 0) {
                stochKSeriesRef.current.setData(k);
                setLastK(k[k.length - 1]!.value);
              }
              if (d.length > 0) {
                stochDSeriesRef.current.setData(d);
                setLastD(d[d.length - 1]!.value);
              }
            }
          }

          mainChartRef.current.timeScale().setVisibleLogicalRange(
            visibleLogicalRangeForBarCount(sorted.length, preferredVisibleBarsRef.current),
          );
        } catch (e) {
          console.warn("[chart] setData error:", e);
          return;
        }

        prevDataKeyRef.current = dataKey;
        prevCandlesLenRef.current = sorted.length;
        prevLastTimeRef.current = lastCandle.t;
        lastChartFingerprintRef.current = fingerprint;
        chartDataReadyRef.current = true;
        setLastRenderedDataKey(dataKey);
        return;
      }

      let preservedRange: { from: number; to: number } | null = null;
      try {
        preservedRange = mainChartRef.current.timeScale().getVisibleLogicalRange();
      } catch {
        preservedRange = null;
      }

      const lenChanged = sorted.length !== prevCandlesLenRef.current;
      const timeWentBackward = lastCandle.t < prevLastTimeRef.current;

      if (sorted.length - prevCandlesLenRef.current > 2 || timeWentBackward) {
        try {
          candleSeriesRef.current.setData(
            sorted.map((c, i) => ({
              time: times[i]!,
              open: parsePrice(c.o),
              high: parsePrice(c.h),
              low: parsePrice(c.l),
              close: parsePrice(c.c),
            })),
          );
          volumeSeriesRef.current.setData(
            sorted.map((c, i) => ({
              time: times[i]!,
              value: vols[i]!,
              color: parsePrice(c.c) >= parsePrice(c.o) ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
            })),
          );
          if (vols.length >= 20) volumeSmaSeriesRef.current.setData(calcSMA(vols, times, 20));
          applySmmaToChart(
            sma21SeriesRef.current,
            sma200SeriesRef.current,
            sm.sma21,
            sm.sma200,
            lastTime,
            sorted.length,
            "full",
          );
          setLastVol(vols[vols.length - 1] ?? null);
          if (preservedRange) {
            try {
              mainChartRef.current.timeScale().setVisibleLogicalRange(preservedRange);
            } catch {
              /* ignore */
            }
          }
        } catch (e) {
          console.warn("[chart] bulk setData error:", e);
        }
      } else {
        try {
          candleSeriesRef.current.update({
            time: lastTime,
            open: parsePrice(lastCandle.o),
            high: parsePrice(lastCandle.h),
            low: parsePrice(lastCandle.l),
            close: parsePrice(lastCandle.c),
          });

          volumeSeriesRef.current.update({
            time: lastTime,
            value: parsePrice(lastCandle.v),
            color: parsePrice(lastCandle.c) >= parsePrice(lastCandle.o) ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
          });
          setLastVol(parsePrice(lastCandle.v));

          applySmmaToChart(
            sma21SeriesRef.current,
            sma200SeriesRef.current,
            sm.sma21,
            sm.sma200,
            lastTime,
            sorted.length,
            lenChanged ? "full" : "tail",
          );
          if (vols.length >= 20) {
            const vs = calcSMA(vols, times, 20);
            if (vs.length > 0) {
              if (lenChanged) volumeSmaSeriesRef.current.setData(vs);
              else volumeSmaSeriesRef.current.update(vs[vs.length - 1]!);
            }
          }

          if (!hideIndicators && rsiSeriesRef.current && stochKSeriesRef.current && stochDSeriesRef.current) {
            const rsiData = calcRSI(closes, times, 14);
            if (rsiData.length > 0) {
              rsiSeriesRef.current.update(rsiData[rsiData.length - 1]!);
              setLastRSI(rsiData[rsiData.length - 1]!.value);
            }
            if (rsiData.length >= 14) {
              const { k, d } = calcStochRSI(rsiData, 14, 3, 3);
              if (k.length > 0) {
                stochKSeriesRef.current.update(k[k.length - 1]!);
                setLastK(k[k.length - 1]!.value);
              }
              if (d.length > 0) {
                stochDSeriesRef.current.update(d[d.length - 1]!);
                setLastD(d[d.length - 1]!.value);
              }
            }
          }
        } catch (e) {
          console.warn("[chart] update error:", e);
        }
        if (preservedRange) {
          try {
            mainChartRef.current.timeScale().setVisibleLogicalRange(preservedRange);
          } catch {
            /* ignore */
          }
        }
      }

      prevCandlesLenRef.current = sorted.length;
      prevLastTimeRef.current = lastCandle.t;
      lastChartFingerprintRef.current = fingerprint;
      chartDataReadyRef.current = true;
      setLastRenderedDataKey(dataKey);
    })();
  }, [candles, parsePrice, hideIndicators, coin, interval, chartVersion]);

  useEffect(() => {
    setNativeTpslOverride({ tp: null, sl: null });
  }, [coin]);

  const tpslPriceSynced = (a: number, b: number) =>
    Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-9);

  useEffect(() => {
    const position = positions.find((p) => p.coin === coin);
    if (!position) {
      setNativeTpslOverride({ tp: null, sl: null });
      return;
    }
    const { tpPrice, slPrice } = selectTpSlOrders(coin, position, openOrders);
    setNativeTpslOverride((o) => {
      const nextTp = o.tp != null && tpPrice != null && tpslPriceSynced(o.tp, tpPrice) ? null : o.tp;
      const nextSl = o.sl != null && slPrice != null && tpslPriceSynced(o.sl, slPrice) ? null : o.sl;
      if (nextTp === o.tp && nextSl === o.sl) return o;
      return { tp: nextTp, sl: nextSl };
    });
  }, [coin, positions, openOrders]);

  const onTpslPendingCommit = useCallback((kind: "tp" | "sl", price: number) => {
    setNativeTpslOverride((o) => ({ ...o, [kind]: price }));
  }, []);

  const onTpslPendingClear = useCallback((kind: "tp" | "sl") => {
    setNativeTpslOverride((o) => ({ ...o, [kind]: null }));
  }, []);

  const isBullish = smaStatus?.isBullish ?? true;
  const patternOverlayLeft = drawingEnabled ? "left-12" : "left-2";
  const patternAuthStatus =
    patternsErrorDetail && typeof patternsErrorDetail === "object" && "status" in patternsErrorDetail
      ? (patternsErrorDetail as Error & { status?: number }).status
      : undefined;
  const patternsScanComplete = signals !== undefined && !patternsFetching;

  // ── Render ──
  return (
    <div ref={outerRef} className={`flex flex-col overflow-hidden ${className}`} style={{ background: BG }}>

      {/* ── Main chart pane ── */}
      <div
        style={{ flexGrow: weights[0], minHeight: 100 }}
        className="relative isolate overflow-hidden flex flex-col min-h-[100px]"
        data-chart-layout-tick={chartLayoutTick}
      >
        {drawingEnabled ? (
          <ChartDrawingProvider
            enabled={drawingEnabled}
            coin={coin}
            interval={interval}
            chartRef={mainChartRef}
            seriesRef={candleSeriesRef}
            paneRef={chartPaneRef}
            layoutTick={chartLayoutTick}
            chartReadyTick={chartVersion}
          >
            <div className="flex flex-1 flex-row min-h-0 h-full">
              <ChartDrawingLeftToolbar />
              <div
                ref={chartPaneRef}
                className="relative flex-1 min-w-0 isolate overflow-hidden"
              >
                <div ref={mainContainerRef} className="absolute inset-0 z-0" data-testid="pattern-chart" />
                <ApexSovereign
                  coin={coin}
                  currentPrice={currentPrice ?? 0}
                  chartPaneRef={mainContainerRef}
                  candleSeriesRef={candleSeriesRef}
                  chartVersion={chartVersion}
                  chartLayoutTick={chartLayoutTick}
                  pendingOverride={nativeTpslOverride}
                  onPendingCommit={onTpslPendingCommit}
                  onPendingClear={onTpslPendingClear}
                  onDraggingChange={setTpslDragging}
                />
                <ChartOrderLines
                  coin={coin}
                  currentPrice={currentPrice ?? 0}
                  visiblePriceRange={visiblePriceRange}
                  tpslRenderedExternally
                  entryRenderedExternally
                  liqRenderedExternally
                />
                <ChartDrawingCanvas />
                <ChartDrawingInteractionLayer />
                <ChartCandleCountdown
                  interval={interval}
                  candles={candles}
                  chartRef={mainChartRef}
                  seriesRef={candleSeriesRef}
                  paneRef={chartPaneRef}
                  layoutTick={chartLayoutTick}
                />
                {showChartLoadingOverlay && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="animate-spin h-7 w-7 text-[#b2b5be]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      <span className="text-[11px] text-[#b2b5be]">
                        {isRetryingEmptyCandles ? "Retrying chart data…" : "Loading chart…"}
                      </span>
                    </div>
                  </div>
                )}
                {showNoDataFallback && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-[#b2b5be] text-sm">No chart data available</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[#2a3249] bg-[#1b2035] text-[#b2b5be] hover:bg-[#252a40] hover:text-white"
                        onClick={() => void refetchCandles()}
                        data-testid="button-retry-chart-data"
                      >
                        Retry chart
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ChartDrawingProvider>
        ) : (
          <div ref={chartPaneRef} className="relative flex-1 isolate overflow-hidden">
            <div ref={mainContainerRef} className="absolute inset-0 z-0" data-testid="pattern-chart" />
            <ApexSovereign
              coin={coin}
              currentPrice={currentPrice ?? 0}
              chartPaneRef={mainContainerRef}
              candleSeriesRef={candleSeriesRef}
              chartVersion={chartVersion}
              chartLayoutTick={chartLayoutTick}
              pendingOverride={nativeTpslOverride}
              onPendingCommit={onTpslPendingCommit}
              onPendingClear={onTpslPendingClear}
              onDraggingChange={setTpslDragging}
            />
            <ChartOrderLines
              coin={coin}
              currentPrice={currentPrice ?? 0}
              visiblePriceRange={visiblePriceRange}
              tpslRenderedExternally
              entryRenderedExternally
              liqRenderedExternally
            />
            <ChartCandleCountdown
              interval={interval}
              candles={candles}
              chartRef={mainChartRef}
              seriesRef={candleSeriesRef}
              paneRef={chartPaneRef}
              layoutTick={chartLayoutTick}
            />
            {showChartLoadingOverlay && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <svg className="animate-spin h-7 w-7 text-[#b2b5be]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span className="text-[11px] text-[#b2b5be]">
                    {isRetryingEmptyCandles ? "Retrying chart data…" : "Loading chart…"}
                  </span>
                </div>
              </div>
            )}
            {showNoDataFallback && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[#b2b5be] text-sm">No chart data available</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#2a3249] bg-[#1b2035] text-[#b2b5be] hover:bg-[#252a40] hover:text-white"
                    onClick={() => void refetchCandles()}
                    data-testid="button-retry-chart-data"
                  >
                    Retry chart
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Volume label */}
        <div
          className={cn(
            "absolute top-1 z-10 pointer-events-none flex items-center gap-1",
            drawingEnabled ? "left-12" : "left-1",
          )}
        >
          <span className="text-[10px] text-[#b2b5be] font-mono">Volume SMA</span>
          {lastVol !== null && <span className="text-[10px] text-[#f59e0b] font-mono">{fmtVol(lastVol)}</span>}
        </div>

        {/* SMMA legend */}
        <div className="absolute top-1 right-8 z-10 pointer-events-none flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-white" />
            <span className="text-[9px] text-[#b2b5be]">SMMA 21</span>
          </span>
          <span className="flex items-center gap-1" style={{ opacity: (candles?.length ?? 0) >= 200 ? 1 : 0.35 }}>
            <span className="inline-block w-4 h-0.5" style={{ background: "#f5e642" }} />
            <span className="text-[9px] text-[#b2b5be]">SMMA 200{(candles?.length ?? 0) < 200 ? " (N/A)" : ""}</span>
          </span>
        </div>

        {/* Pattern readout — top-left on the price pane */}
        {patternScanEnabled && activeSignal ? (
          <Card
            className={cn(
              "absolute top-2 p-3 bg-[#1a2035]/95 backdrop-blur-sm border border-primary/30 shadow-xl max-w-[min(92vw,280px)] z-40 pointer-events-auto",
              patternOverlayLeft,
            )}
            data-testid="chart-pattern-insight"
          >
            {/* Header */}
            <div className="flex items-center gap-1.5 mb-2">
              {activeSignal.bias === "bullish"
                ? <TrendingUp className="h-3.5 w-3.5 text-green-400 shrink-0" />
                : activeSignal.bias === "bearish"
                ? <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />}
              <span className={`text-[11px] font-bold ${activeSignal.bias === "bullish" ? "text-green-300" : activeSignal.bias === "bearish" ? "text-red-300" : "text-yellow-300"}`}>
                {activeSignal.bias === "bullish" ? "Bullish Pattern" : activeSignal.bias === "bearish" ? "Bearish Pattern" : "Neutral Pattern"}
              </span>
              <Badge className={`ml-auto text-[8px] px-1 shrink-0 ${activeSignalStatus?.className ?? "bg-emerald-800"}`}>
                {activeSignalStatus?.label ?? "DEVELOPED"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[10px] font-medium text-[#e8ecf1]">{activeSignal.patternName}</p>
              <Badge variant="outline" className="h-4 px-1 text-[8px] leading-none shrink-0">
                {activeSignal.timeframe}
              </Badge>
            </div>

            {/* Tradeable badge */}
              <div className={`rounded px-2 py-1 mb-2 ${activeSignal.tradeable ? "bg-green-900/50 border border-green-700/50" : "bg-orange-900/30 border border-orange-700/30"}`}>
              <p className={`text-[10px] font-semibold ${activeSignal.tradeable ? "text-green-300" : "text-orange-300"}`}>
                {activeSignal.tradeable
                  ? "✓ Pattern visible — geometry-first scanner"
                  : "⚠ Context note — review SMMA copy on card"}
              </p>
            </div>

            {/* MA filter reason */}
            <p className="text-[9px] text-[#8c9ab5] mb-2 leading-relaxed">{liveSmmaReason}</p>

            {/* SMMA values */}
            <div className="flex gap-3 text-[9px] mb-2">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-white inline-block" />
                <span className="text-[#8c9ab5]">SMMA 21</span>
                <span className="font-mono text-[#e8ecf1]">{displayedSma21?.toFixed(2) ?? "N/A"}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 inline-block" style={{ background: "#f5e642" }} />
                <span className="text-[#8c9ab5]">SMMA 200</span>
                <span className="font-mono text-[#e8ecf1]">{displayedSma200?.toFixed(2) ?? "N/A"}</span>
              </span>
            </div>
            <p className="text-[8px] text-[#6b7a99] mb-2">{smmaLabel}</p>

            {/* Educational note */}
            <div className="border-t border-[#2a3249] pt-1.5 space-y-1.5">
              <p className="text-[9px] text-[#6b7a99] leading-relaxed">{activeSignal.educationalNote}</p>
              {activeSignal.whatToWatch ? (
                <p className="text-[9px] text-amber-200/90 leading-relaxed">
                  <span className="font-semibold text-amber-400">Next: </span>
                  {activeSignal.whatToWatch}
                </p>
              ) : null}
            </div>
          </Card>
        ) : patternScanEnabled && patternsFetching && !activeSignal ? (
          <Card
            className={cn(
              "absolute top-2 p-2.5 bg-[#1a2035]/95 backdrop-blur-sm border border-[#2a3249] shadow-lg max-w-[min(92vw,240px)] z-40 pointer-events-none",
              patternOverlayLeft,
            )}
            data-testid="chart-pattern-scanning"
          >
            <p className="text-[10px] font-medium text-[#b2b5be]">Scanning patterns…</p>
            <p className="text-[9px] text-[#6b7a99] mt-1">
              {coin} · {interval}
            </p>
          </Card>
        ) : patternScanEnabled && patternsError ? (
          <Card
            className={cn(
              "absolute top-2 p-2.5 bg-[#1a2035]/95 backdrop-blur-sm border border-orange-700/40 shadow-lg max-w-[min(92vw,260px)] z-40 pointer-events-auto",
              patternOverlayLeft,
            )}
            data-testid="chart-pattern-error"
          >
            <p className="text-[10px] font-semibold text-orange-300">
              {patternAuthStatus === 403 ? "Pro required for AI patterns" : "Pattern scan unavailable"}
            </p>
            <p className="text-[9px] text-[#6b7a99] mt-1 leading-relaxed">
              {patternAuthStatus === 401
                ? "Connect your wallet to load pattern readouts."
                : patternAuthStatus === 403
                  ? "Upgrade to Pro to see forming pattern names on the chart."
                  : "Could not reach the pattern scanner. Try again."}
            </p>
            {patternAuthStatus !== 403 ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-[10px] border-[#2a3249] bg-[#1b2035] text-[#b2b5be]"
                onClick={() => void refetchPatterns()}
              >
                Retry scan
              </Button>
            ) : null}
          </Card>
        ) : patternScanEnabled && patternsScanComplete && !activeSignal ? (
          <Card
            className={cn(
              "absolute top-2 p-2.5 bg-[#1a2035]/90 backdrop-blur-sm border border-[#2a3249] shadow-lg max-w-[min(92vw,240px)] z-40 pointer-events-none",
              patternOverlayLeft,
            )}
            data-testid="chart-pattern-none"
          >
            <p className="text-[10px] font-medium text-[#b2b5be]">No pattern detected</p>
            <p className="text-[9px] text-[#6b7a99] mt-1">
              {coin} · {interval} — geometry scan is clear for now.
            </p>
          </Card>
        ) : smaStatus ? (
          <div
            className={cn(
              "absolute top-2 z-30 pointer-events-none max-w-[min(90vw,220px)]",
              patternOverlayLeft,
            )}
          >
            <div className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${isBullish ? "text-green-400" : "text-red-400"}`}
              style={{ background: "rgba(19,23,34,0.7)" }}>
              {isBullish ? "21 > 200 · Bullish bias" : "21 < 200 · Bearish bias"}
            </div>
          </div>
        ) : null}
      </div>

      {!hideIndicators && (
        <PremiumFeatureLock
          locked={lockPremiumIndicatorStack}
          featureLabel="AI Pattern Detection & indicators"
          title="Upgrade to Pro"
          subtitle="Unlock RSI / Stoch RSI, Morning Star–style scans, and full AI pattern readouts."
          className="flex flex-col flex-1 min-h-0"
        >
          <>
            {/* ── Drag handle: main (price + volume) ↔ RSI ── */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize chart vs indicators"
              onPointerDown={startResizeDrag(0)}
              className="flex-shrink-0 cursor-row-resize touch-none group select-none"
              style={{ height: HANDLE_PX, background: BORDER }}
            >
              <div className="w-full h-full group-hover:bg-blue-500/60 transition-colors rounded-sm" />
            </div>

            {/* ── RSI pane ── */}
            <div style={{ flexGrow: weights[1], minHeight: 50, background: BG_IND }} className="relative overflow-hidden">
              <div ref={rsiContainerRef} className="absolute inset-0" />
              <div className="absolute top-0.5 left-1 z-10 pointer-events-none flex items-center gap-1.5">
                <span className="text-[10px] text-[#b2b5be] font-mono">RSI</span>
                <span className="text-[10px] text-[#b2b5be] font-mono">14</span>
                {lastRSI !== null && <span className="text-[10px] font-mono" style={{ color: "#a78bfa" }}>{lastRSI.toFixed(2)}</span>}
              </div>
            </div>

            {/* ── Drag handle: RSI ↔ Stoch ── */}
            <div
              role="separator"
              aria-orientation="horizontal"
              title="Drag to resize RSI vs Stoch"
              onPointerDown={startResizeDrag(1)}
              className="flex-shrink-0 cursor-row-resize touch-none group select-none"
              style={{ height: HANDLE_PX, background: BORDER }}
            >
              <div className="w-full h-full group-hover:bg-blue-500/60 transition-colors rounded-sm" />
            </div>

            {/* ── Stoch RSI pane ── */}
            <div style={{ flexGrow: weights[2], minHeight: 50, background: BG_IND }} className="relative overflow-hidden">
              <div ref={stochContainerRef} className="absolute inset-0" />
              <div className="absolute top-0.5 left-1 z-10 pointer-events-none flex items-center gap-1.5">
                <span className="text-[10px] text-[#b2b5be] font-mono">Stoch RSI</span>
                <span className="text-[10px] text-[#b2b5be] font-mono">14 14 3 3</span>
                {lastK !== null && <span className="text-[10px] font-mono" style={{ color: "#2962ff" }}>{lastK.toFixed(2)}</span>}
                {lastD !== null && <span className="text-[10px] font-mono" style={{ color: "#ff6d00" }}>{lastD.toFixed(2)}</span>}
              </div>
            </div>
          </>
        </PremiumFeatureLock>
      )}

      {/* Hidden RSI/Stoch containers — kept in DOM so refs are always mounted */}
      {hideIndicators && (
        <div style={{ display: "none" }}>
          <div ref={rsiContainerRef} />
          <div ref={stochContainerRef} />
        </div>
      )}
    </div>
  );
}

export const PatternChart = memo(PatternChartComponent);
