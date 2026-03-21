import { useEffect, useRef, useState, memo, useCallback } from "react";
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
  type IPriceLine,
  type Time,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { useTrading } from "@/lib/trading-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface EducationalPatternSignal {
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
  detectedAt: string;
}

interface PatternChartProps {
  symbol: string;
  interval?: string;
  className?: string;
  currentPrice?: number;
  showSignals?: boolean;
  hideIndicators?: boolean;
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
const HANDLE_PX = 4;

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

function PatternChartComponent({
  symbol = "BTC",
  interval = "5m",
  className = "",
  currentPrice = 0,
  showSignals = false,
  hideIndicators = false,
}: PatternChartProps) {
  const outerRef = useRef<HTMLDivElement>(null);
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
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const isSyncingRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  // Pane resize state — flex-grow weights
  const [weights, setWeights] = useState([6, 2, 2]);
  const [lastVol, setLastVol] = useState<number | null>(null);
  const [lastRSI, setLastRSI] = useState<number | null>(null);
  const [lastK, setLastK] = useState<number | null>(null);
  const [lastD, setLastD] = useState<number | null>(null);
  const [smaStatus, setSmaStatus] = useState<{ sma21: number; sma200: number; isBullish: boolean } | null>(null);
  const [activeSignal, setActiveSignal] = useState<EducationalPatternSignal | null>(null);

  const { theme } = useTheme();
  const { positions, openOrders } = useTrading();
  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  // Reset chart fit flag and clear stale indicator values whenever the symbol changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    setLastVol(null);
    setLastRSI(null);
    setLastK(null);
    setLastD(null);
    setSmaStatus(null);
    setActiveSignal(null);
    // Clear existing series data so old candles don't show while new ones load
    if (candleSeriesRef.current) candleSeriesRef.current.setData([]);
    if (sma21SeriesRef.current) sma21SeriesRef.current.setData([]);
    if (sma200SeriesRef.current) sma200SeriesRef.current.setData([]);
    if (volumeSeriesRef.current) volumeSeriesRef.current.setData([]);
    if (volumeSmaSeriesRef.current) volumeSmaSeriesRef.current.setData([]);
    if (rsiSeriesRef.current) rsiSeriesRef.current.setData([]);
    if (stochKSeriesRef.current) stochKSeriesRef.current.setData([]);
    if (stochDSeriesRef.current) stochDSeriesRef.current.setData([]);
  }, [coin]);

  const { data: candles, isLoading: candlesLoading } = useQuery<CandleData[]>({
    queryKey: [`/api/hyperliquid/candles/${coin}?interval=${interval}`],
    refetchInterval: 10000,
  });

  const { data: signals } = useQuery<EducationalPatternSignal[]>({
    queryKey: [`/api/signals/patterns?timeframes=${interval}`],
    refetchInterval: 60000,
    enabled: showSignals,
  });

  const parsePrice = useCallback((val: number | string): number =>
    typeof val === "string" ? parseFloat(val) : val, []);

  // ── Drag-to-resize logic ──
  const startDrag = useCallback((handleIdx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const container = outerRef.current;
    if (!container) return;
    const startY = e.clientY;
    const startWeights = [...weights];
    const totalH = container.clientHeight - HANDLE_PX * 2;
    const totalW = startWeights.reduce((a, b) => a + b, 0);
    const a = handleIdx, b = handleIdx + 1;
    const minW = totalW * 0.07;
    const combined = startWeights[a] + startWeights[b];

    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientY - startY) / totalH) * totalW;
      const newA = Math.max(minW, Math.min(combined - minW, startWeights[a] + delta));
      const next = [...startWeights];
      next[a] = newA;
      next[b] = combined - newA;
      setWeights(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [weights]);

  // ── SMA status for signal card ──
  useEffect(() => {
    if (!candles || candles.length < 21) { setSmaStatus(null); return; }
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    const closes = sorted.map(c => parsePrice(c.c));
    const times = sorted.map(c => (c.t / 1000) as Time);
    const sma21 = calcSMA(closes, times, 21);
    const period200 = Math.min(sorted.length - 1, 200);
    const sma200 = period200 >= 10 ? calcSMA(closes, times, period200) : [];
    const s21 = sma21.length > 0 ? sma21[sma21.length - 1].value : 0;
    const s200 = sma200.length > 0 ? sma200[sma200.length - 1].value : 0;
    if (s21 > 0) setSmaStatus({ sma21: s21, sma200: s200, isBullish: s21 > s200 });
  }, [candles, parsePrice]);

  useEffect(() => {
    const currentSignal = signals?.find(s => s.coin === coin && s.timeframe === interval);
    if (currentSignal && smaStatus) {
      const sigBull = currentSignal.bias === "bullish";
      setActiveSignal((smaStatus.isBullish && sigBull) || (!smaStatus.isBullish && !sigBull) ? currentSignal : null);
    } else {
      setActiveSignal(null);
    }
  }, [signals, smaStatus, coin, interval]);

  // ── Chart initialization ──
  const chartBase = useCallback((isDark: boolean) => ({
    layout: { background: { type: ColorType.Solid, color: BG }, textColor: TEXT },
    grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: BORDER, autoScale: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  }), []);

  useEffect(() => {
    if (!mainContainerRef.current) return;
    if (!hideIndicators && (!rsiContainerRef.current || !stochContainerRef.current)) return;

    // ── Main ──
    const mainChart = createChart(mainContainerRef.current, {
      ...chartBase(theme === "dark"),
      timeScale: { borderColor: BORDER, timeVisible: true, visible: hideIndicators, rightOffset: 5, barSpacing: 8 },
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candleSeries;

    const sma21 = mainChart.addSeries(LineSeries, {
      color: "#ffffff", lineWidth: 2, title: "21", priceLineVisible: false, lastValueVisible: true,
    });
    sma21SeriesRef.current = sma21;

    const sma200 = mainChart.addSeries(LineSeries, {
      color: "#f5e642", lineWidth: 2, title: "200", priceLineVisible: false, lastValueVisible: true,
    });
    sma200SeriesRef.current = sma200;

    const volSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeriesRef.current = volSeries;

    const volSmaSeries = mainChart.addSeries(LineSeries, {
      color: "#f59e0b", lineWidth: 1, priceScaleId: "volume",
      priceLineVisible: false, lastValueVisible: false, title: "",
    });
    volumeSmaSeriesRef.current = volSmaSeries;

    const obs = (el: HTMLDivElement, chart: IChartApi) => {
      const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
      ro.observe(el);
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      return ro;
    };
    const r1 = obs(mainContainerRef.current!, mainChart);
    const cleanups: (() => void)[] = [() => { r1.disconnect(); mainChart.remove(); mainChartRef.current = null; }];

    if (!hideIndicators && rsiContainerRef.current && stochContainerRef.current) {
      // ── RSI ──
      const rsiChart = createChart(rsiContainerRef.current, {
        ...chartBase(theme === "dark"),
        layout: { background: { type: ColorType.Solid, color: BG_IND }, textColor: TEXT },
        grid: { vertLines: { color: "#252a40" }, horzLines: { color: "#252a40" } },
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

      // ── Stoch RSI ──
      const stochChart = createChart(stochContainerRef.current, {
        ...chartBase(theme === "dark"),
        layout: { background: { type: ColorType.Solid, color: BG_IND }, textColor: TEXT },
        grid: { vertLines: { color: "#252a40" }, horzLines: { color: "#252a40" } },
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

      // ── Time sync ──
      const sync = (src: IChartApi, targets: IChartApi[]) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const r = src.timeScale().getVisibleLogicalRange();
        if (r) targets.forEach(t => t.timeScale().setVisibleLogicalRange(r));
        isSyncingRef.current = false;
      };
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(mainChart, [rsiChart, stochChart]));
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(rsiChart, [mainChart, stochChart]));
      stochChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(stochChart, [mainChart, rsiChart]));

      const r2 = obs(rsiContainerRef.current!, rsiChart);
      const r3 = obs(stochContainerRef.current!, stochChart);
      cleanups.push(() => { r2.disconnect(); r3.disconnect(); rsiChart.remove(); stochChart.remove(); rsiChartRef.current = null; stochChartRef.current = null; });
    }

    isInitialLoadRef.current = true;

    return () => cleanups.forEach(fn => fn());
  }, [theme, chartBase, hideIndicators]);

  // ── Data update ──
  useEffect(() => {
    if (!candles || !candleSeriesRef.current || !sma21SeriesRef.current || !sma200SeriesRef.current) return;
    if (!volumeSeriesRef.current || !volumeSmaSeriesRef.current) return;
    if (!hideIndicators && (!rsiSeriesRef.current || !stochKSeriesRef.current || !stochDSeriesRef.current)) return;

    const sorted = [...candles].sort((a, b) => a.t - b.t);
    const closes = sorted.map(c => parsePrice(c.c));
    const times = sorted.map(c => (c.t / 1000) as Time);
    const vols = sorted.map(c => parsePrice(c.v));

    candleSeriesRef.current.setData(sorted.map((c, i) => ({
      time: times[i], open: parsePrice(c.o), high: parsePrice(c.h),
      low: parsePrice(c.l), close: parsePrice(c.c),
    })));

    const volData = sorted.map((c, i) => ({
      time: times[i], value: vols[i],
      color: parsePrice(c.c) >= parsePrice(c.o) ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
    }));
    volumeSeriesRef.current.setData(volData);
    setLastVol(vols[vols.length - 1] ?? null);

    // Volume SMA-20
    if (vols.length >= 20) {
      volumeSmaSeriesRef.current.setData(calcSMA(vols, times, 20));
    }

    if (sorted.length >= 21) sma21SeriesRef.current.setData(calcSMA(closes, times, 21));
    const p200 = Math.min(sorted.length - 1, 200);
    if (p200 >= 10) sma200SeriesRef.current.setData(calcSMA(closes, times, p200));

    if (!hideIndicators && rsiSeriesRef.current && stochKSeriesRef.current && stochDSeriesRef.current) {
      const rsiData = calcRSI(closes, times, 14);
      if (rsiData.length > 0) {
        rsiSeriesRef.current.setData(rsiData);
        setLastRSI(rsiData[rsiData.length - 1].value);
      }
      if (rsiData.length >= 14) {
        const { k, d } = calcStochRSI(rsiData, 14, 3, 3);
        if (k.length > 0) { stochKSeriesRef.current.setData(k); setLastK(k[k.length - 1].value); }
        if (d.length > 0) { stochDSeriesRef.current.setData(d); setLastD(d[d.length - 1].value); }
      }
    }

    if (mainChartRef.current && isInitialLoadRef.current) {
      mainChartRef.current.timeScale().fitContent();
      isInitialLoadRef.current = false;
    }
  }, [candles, parsePrice, hideIndicators]);

  // ── TP/SL/Entry/Liq price lines ──
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    priceLineRefs.current.forEach(l => { try { series.removePriceLine(l); } catch (_) {} });
    priceLineRefs.current = [];

    const add = (price: number, color: string, title: string) => {
      if (!price || isNaN(price) || price <= 0) return;
      priceLineRefs.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }));
    };

    const pos = positions.find(p => p.coin === coin);
    if (pos) {
      const isLong = pos.side === "long";
      const orders = openOrders.filter(o => o.coin === coin);
      const getType = (o: any) => {
        const ot = (o.orderType || "").toLowerCase();
        if (ot.includes("take profit")) return "tp";
        if (ot.includes("stop")) return "sl";
        const px = parseFloat(o.triggerPx || o.limitPx);
        if (isNaN(px)) return "other";
        return isLong ? (px > (pos.entryPrice || currentPrice) ? "tp" : "sl") : (px < (pos.entryPrice || currentPrice) ? "tp" : "sl");
      };
      const tp = orders.find(o => getType(o) === "tp");
      const sl = orders.find(o => getType(o) === "sl");
      if (tp) add(parseFloat(tp.triggerPx || tp.limitPx), "#22c55e", "TP");
      if (pos.entryPrice) add(pos.entryPrice, "#60a5fa", "Entry");
      if (sl) add(parseFloat(sl.triggerPx || sl.limitPx), "#ef4444", "SL");
      if (pos.liquidationPrice > 0) add(pos.liquidationPrice, "#f97316", "Liq.");
    }
  }, [positions, openOrders, coin, currentPrice]);

  const isBullish = smaStatus?.isBullish ?? true;

  // ── Render ──
  return (
    <div ref={outerRef} className={`flex flex-col overflow-hidden ${className}`} style={{ background: BG }}>

      {/* ── Main chart pane ── */}
      <div style={{ flexGrow: weights[0], minHeight: 100 }} className="relative overflow-hidden">
        <div ref={mainContainerRef} className="absolute inset-0" data-testid="pattern-chart" />

        {/* Loading overlay when switching assets */}
        {candlesLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin h-7 w-7 text-[#b2b5be]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-[11px] text-[#b2b5be]">Loading chart…</span>
            </div>
          </div>
        )}

        {/* No data fallback */}
        {!candlesLoading && (!candles || candles.length === 0) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]">
            <p className="text-[#b2b5be] text-sm">No chart data available</p>
          </div>
        )}

        {/* Volume label */}
        <div className="absolute top-1 left-1 z-10 pointer-events-none flex items-center gap-1">
          <span className="text-[10px] text-[#b2b5be] font-mono">Volume SMA</span>
          {lastVol !== null && <span className="text-[10px] text-[#f59e0b] font-mono">{fmtVol(lastVol)}</span>}
        </div>

        {/* SMA legend */}
        <div className="absolute top-1 right-8 z-10 pointer-events-none flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-white" />
            <span className="text-[9px] text-[#b2b5be]">21</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5" style={{ background: "#f5e642" }} />
            <span className="text-[9px] text-[#b2b5be]">200</span>
          </span>
        </div>

        {/* Signal overlay card */}
        {showSignals && activeSignal ? (
          <Card className="absolute top-8 left-1 p-3 bg-[#1a2035]/95 backdrop-blur-sm border border-[#2a3249] shadow-xl max-w-xs z-10">
            <div className="flex items-center gap-2 mb-2">
              {activeSignal.bias === "bullish" ? <TrendingUp className="h-4 w-4 text-green-400" /> :
               activeSignal.bias === "bearish" ? <TrendingDown className="h-4 w-4 text-red-400" /> :
               <AlertCircle className="h-4 w-4 text-yellow-400" />}
              <span className="font-semibold text-sm text-[#e8ecf1]">{activeSignal.patternName}</span>
              <Badge className={`text-[9px] px-1 ${activeSignal.patternStatus === "breakout_watch" ? "bg-amber-600" : activeSignal.patternStatus === "forming" ? "bg-yellow-700" : "bg-green-700"}`}>
                {activeSignal.patternStatus === "breakout_watch" ? "WATCH" : activeSignal.patternStatus === "forming" ? "FORMING" : "DEVELOPED"}
              </Badge>
            </div>
            <div className="bg-blue-900/40 border border-blue-700/40 rounded px-2 py-1 mb-2">
              <p className="text-[10px] text-blue-300">Educational · Learn to identify your own entries</p>
            </div>
            <p className="text-[10px] text-[#8c9ab5] mb-2 leading-relaxed">{activeSignal.educationalNote}</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] mb-2">
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-white inline-block" /><span className="text-[#8c9ab5]">21 SMA</span><span className="font-mono text-[#e8ecf1]">${activeSignal.sma21.toFixed(1)}</span></span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 inline-block" style={{ background: "#f5e642" }} /><span className="text-[#8c9ab5]">200 SMA</span><span className="font-mono text-[#e8ecf1]">${activeSignal.sma200.toFixed(1)}</span></span>
            </div>
            <div className="border-t border-[#2a3249] pt-2">
              <p className="text-[10px] font-medium text-amber-400 mb-0.5">What to Watch:</p>
              <p className="text-[10px] text-[#8c9ab5] leading-relaxed">{activeSignal.whatToWatch}</p>
            </div>
          </Card>
        ) : smaStatus ? (
          <div className="absolute top-8 left-1 z-10 pointer-events-none">
            <div className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${isBullish ? "text-green-400" : "text-red-400"}`}
              style={{ background: "rgba(19,23,34,0.7)" }}>
              {isBullish ? "21 > 200 · Bullish bias" : "21 < 200 · Bearish bias"}
            </div>
          </div>
        ) : null}
      </div>

      {!hideIndicators && (
        <>
          {/* ── Drag handle 1 ── */}
          <div
            onMouseDown={startDrag(0)}
            className="flex-shrink-0 cursor-row-resize group"
            style={{ height: HANDLE_PX, background: BORDER }}
          >
            <div className="w-full h-full group-hover:bg-blue-500/60 transition-colors" />
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

          {/* ── Drag handle 2 ── */}
          <div
            onMouseDown={startDrag(1)}
            className="flex-shrink-0 cursor-row-resize group"
            style={{ height: HANDLE_PX, background: BORDER }}
          >
            <div className="w-full h-full group-hover:bg-blue-500/60 transition-colors" />
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
