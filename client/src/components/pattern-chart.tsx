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
}

interface CandleData {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v: number | string;
}

const CHART_BG_DARK = "#0d1117";
const CHART_BG_LIGHT = "#ffffff";
const GRID_DARK = "#21262d";
const GRID_LIGHT = "#e1e4e8";
const BORDER_DARK = "#30363d";
const BORDER_LIGHT = "#d0d7de";
const TEXT_DARK = "#c9d1d9";
const TEXT_LIGHT = "#24292f";

function calcSMA(closes: number[], times: Time[], period: number): { time: Time; value: number }[] {
  const result: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    result.push({ time: times[i], value: sum / period });
  }
  return result;
}

function calcRSI(closes: number[], times: Time[], period = 14): { time: Time; value: number }[] {
  if (closes.length < period + 1) return [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  const result: { time: Time; value: number }[] = [];
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: times[period], value: 100 - 100 / (1 + rs0) });
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: times[i], value: 100 - 100 / (1 + rs) });
  }
  return result;
}

function calcStochRSI(
  rsi: { time: Time; value: number }[],
  period = 14, kSmooth = 3, dSmooth = 3,
): { k: { time: Time; value: number }[]; d: { time: Time; value: number }[] } {
  if (rsi.length < period) return { k: [], d: [] };
  const rawStoch: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < rsi.length; i++) {
    const vals = rsi.slice(i - period + 1, i + 1).map(x => x.value);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    rawStoch.push({ time: rsi[i].time, value: mx === mn ? 50 : ((rsi[i].value - mn) / (mx - mn)) * 100 });
  }
  const k: { time: Time; value: number }[] = [];
  for (let i = kSmooth - 1; i < rawStoch.length; i++) {
    const sum = rawStoch.slice(i - kSmooth + 1, i + 1).reduce((a, x) => a + x.value, 0);
    k.push({ time: rawStoch[i].time, value: sum / kSmooth });
  }
  const d: { time: Time; value: number }[] = [];
  for (let i = dSmooth - 1; i < k.length; i++) {
    const sum = k.slice(i - dSmooth + 1, i + 1).reduce((a, x) => a + x.value, 0);
    d.push({ time: k[i].time, value: sum / dSmooth });
  }
  return { k, d };
}

function PatternChartComponent({ 
  symbol = "BTC", 
  interval = "5m",
  className = "",
  currentPrice = 0,
  showSignals = false,
}: PatternChartProps) {
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
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const priceLineRefs = useRef<IPriceLine[]>([]);
  const isInitialLoadRef = useRef(true);
  const isSyncingRef = useRef(false);

  const { theme } = useTheme();
  const { positions, openOrders } = useTrading();
  const [activeSignal, setActiveSignal] = useState<EducationalPatternSignal | null>(null);
  const [smaStatus, setSmaStatus] = useState<{ sma21: number; sma200: number; isBullish: boolean } | null>(null);

  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  const { data: candles } = useQuery<CandleData[]>({
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

  // SMA status for signal card
  useEffect(() => {
    if (!candles || candles.length < 21) { setSmaStatus(null); return; }
    const sorted = [...candles].sort((a, b) => a.t - b.t);
    const closes = sorted.map(c => parsePrice(c.c));
    const times = sorted.map(c => (c.t / 1000) as Time);
    const sma21 = calcSMA(closes, times, 21);
    const period200 = Math.min(sorted.length, 200);
    const sma200 = sorted.length >= 21 ? calcSMA(closes, times, Math.max(10, Math.floor(period200 * 0.6 < period200 ? period200 : period200))) : [];
    const s21 = sma21.length > 0 ? sma21[sma21.length - 1].value : 0;
    const s200 = sma200.length > 0 ? sma200[sma200.length - 1].value : 0;
    if (s21 > 0) setSmaStatus({ sma21: s21, sma200: s200, isBullish: s21 > s200 });
    else setSmaStatus(null);
  }, [candles, parsePrice]);

  const currentSignal = signals?.find(s => s.coin === coin && s.timeframe === interval);

  useEffect(() => {
    if (currentSignal && smaStatus) {
      const signalIsBullish = currentSignal.bias === "bullish";
      if ((smaStatus.isBullish && signalIsBullish) || (!smaStatus.isBullish && !signalIsBullish)) {
        setActiveSignal(currentSignal);
      } else {
        setActiveSignal(null);
      }
    } else {
      setActiveSignal(null);
    }
  }, [currentSignal, smaStatus]);

  // Build chart options
  const chartOpts = useCallback((isDark: boolean, showTime: boolean) => ({
    layout: {
      background: { type: ColorType.Solid, color: isDark ? CHART_BG_DARK : CHART_BG_LIGHT },
      textColor: isDark ? TEXT_DARK : TEXT_LIGHT,
    },
    grid: {
      vertLines: { color: isDark ? GRID_DARK : GRID_LIGHT, style: LineStyle.Solid },
      horzLines: { color: isDark ? GRID_DARK : GRID_LIGHT, style: LineStyle.Solid },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: isDark ? BORDER_DARK : BORDER_LIGHT, autoScale: true },
    timeScale: {
      borderColor: isDark ? BORDER_DARK : BORDER_LIGHT,
      timeVisible: showTime,
      visible: showTime,
      rightOffset: 5,
      barSpacing: 8,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  }), []);

  // Initialize charts
  useEffect(() => {
    if (!mainContainerRef.current || !rsiContainerRef.current || !stochContainerRef.current) return;
    const isDark = theme === "dark";

    // ── Main chart ──
    const mainChart = createChart(mainContainerRef.current, {
      ...chartOpts(isDark, true),
      timeScale: { borderColor: isDark ? BORDER_DARK : BORDER_LIGHT, timeVisible: true, visible: false, rightOffset: 5, barSpacing: 8 },
    });
    mainChartRef.current = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candleSeries;

    const sma21Series = mainChart.addSeries(LineSeries, {
      color: "#ffffff", lineWidth: 2, lineStyle: LineStyle.Solid,
      title: "21 SMA", priceLineVisible: false, lastValueVisible: true,
    });
    sma21SeriesRef.current = sma21Series;

    const sma200Series = mainChart.addSeries(LineSeries, {
      color: "#f5e642", lineWidth: 2, lineStyle: LineStyle.Solid,
      title: "200 SMA", priceLineVisible: false, lastValueVisible: true,
    });
    sma200SeriesRef.current = sma200Series;

    const volumeSeries = mainChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volumeSeriesRef.current = volumeSeries;

    // ── RSI chart ──
    const rsiChart = createChart(rsiContainerRef.current, {
      ...chartOpts(isDark, false),
      timeScale: { borderColor: isDark ? BORDER_DARK : BORDER_LIGHT, visible: false, rightOffset: 5, barSpacing: 8 },
      rightPriceScale: { borderColor: isDark ? BORDER_DARK : BORDER_LIGHT, autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    rsiChartRef.current = rsiChart;

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: "#a78bfa", lineWidth: 2, title: "", priceLineVisible: false, lastValueVisible: true,
    });
    rsiSeriesRef.current = rsiSeries;
    // Reference levels
    rsiSeries.createPriceLine({ price: 70, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "OB", axisLabelVisible: false });
    rsiSeries.createPriceLine({ price: 30, color: "#22c55e", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "OS", axisLabelVisible: false });
    rsiSeries.createPriceLine({ price: 50, color: "#555", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", axisLabelVisible: false });

    // ── Stoch RSI chart ──
    const stochChart = createChart(stochContainerRef.current, {
      ...chartOpts(isDark, true),
      rightPriceScale: { borderColor: isDark ? BORDER_DARK : BORDER_LIGHT, autoScale: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
    });
    stochChartRef.current = stochChart;

    const stochKSeries = stochChart.addSeries(LineSeries, {
      color: "#38bdf8", lineWidth: 2, title: "K", priceLineVisible: false, lastValueVisible: true,
    });
    stochKSeriesRef.current = stochKSeries;

    const stochDSeries = stochChart.addSeries(LineSeries, {
      color: "#fb923c", lineWidth: 2, title: "D", priceLineVisible: false, lastValueVisible: true,
    });
    stochDSeriesRef.current = stochDSeries;

    stochKSeries.createPriceLine({ price: 80, color: "#ef4444", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });
    stochKSeries.createPriceLine({ price: 20, color: "#22c55e", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "", axisLabelVisible: false });

    // ── Time scale sync ──
    const sync = (source: IChartApi, targets: IChartApi[]) => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const range = source.timeScale().getVisibleLogicalRange();
      if (range) targets.forEach(t => t.timeScale().setVisibleLogicalRange(range));
      isSyncingRef.current = false;
    };
    mainChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(mainChart, [rsiChart, stochChart]));
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(rsiChart, [mainChart, stochChart]));
    stochChart.timeScale().subscribeVisibleLogicalRangeChange(() => sync(stochChart, [mainChart, rsiChart]));

    // ── Resize observers ──
    const observeResize = (el: HTMLDivElement, chart: IChartApi) => {
      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
      ro.observe(el);
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      return ro;
    };
    const roMain = observeResize(mainContainerRef.current!, mainChart);
    const roRsi = observeResize(rsiContainerRef.current!, rsiChart);
    const roStoch = observeResize(stochContainerRef.current!, stochChart);

    isInitialLoadRef.current = true;

    return () => {
      roMain.disconnect(); roRsi.disconnect(); roStoch.disconnect();
      mainChart.remove(); rsiChart.remove(); stochChart.remove();
      mainChartRef.current = null; rsiChartRef.current = null; stochChartRef.current = null;
    };
  }, [theme, chartOpts]);

  // Update data
  useEffect(() => {
    if (!candles || !candleSeriesRef.current || !sma21SeriesRef.current || !sma200SeriesRef.current) return;
    if (!volumeSeriesRef.current || !rsiSeriesRef.current || !stochKSeriesRef.current || !stochDSeriesRef.current) return;

    const sorted = [...candles].sort((a, b) => a.t - b.t);
    const closes = sorted.map(c => parsePrice(c.c));
    const times = sorted.map(c => (c.t / 1000) as Time);
    const vols = sorted.map(c => parsePrice(c.v));

    // Candles
    candleSeriesRef.current.setData(sorted.map((c, i) => ({
      time: times[i], open: parsePrice(c.o), high: parsePrice(c.h),
      low: parsePrice(c.l), close: parsePrice(c.c),
    })));

    // Volume
    volumeSeriesRef.current.setData(sorted.map((c, i) => ({
      time: times[i],
      value: vols[i],
      color: parsePrice(c.c) >= parsePrice(c.o) ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
    })));

    // SMAs
    if (sorted.length >= 21) sma21SeriesRef.current.setData(calcSMA(closes, times, 21));
    const period200 = sorted.length >= 200 ? 200 : Math.max(10, Math.floor(sorted.length * 0.6));
    if (sorted.length > period200) sma200SeriesRef.current.setData(calcSMA(closes, times, period200));

    // RSI
    const rsiData = calcRSI(closes, times, 14);
    if (rsiData.length > 0) rsiSeriesRef.current.setData(rsiData);

    // Stoch RSI
    if (rsiData.length >= 14) {
      const { k, d } = calcStochRSI(rsiData, 14, 3, 3);
      if (k.length > 0) stochKSeriesRef.current.setData(k);
      if (d.length > 0) stochDSeriesRef.current.setData(d);
    }

    if (mainChartRef.current && isInitialLoadRef.current) {
      mainChartRef.current.timeScale().fitContent();
      isInitialLoadRef.current = false;
    }
  }, [candles, parsePrice]);

  // TP/SL/Entry/Liq price lines on the main chart
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;
    priceLineRefs.current.forEach(line => { try { series.removePriceLine(line); } catch (_) {} });
    priceLineRefs.current = [];

    const addLine = (price: number, color: string, title: string) => {
      if (!price || isNaN(price) || price <= 0) return;
      priceLineRefs.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }));
    };

    const position = positions.find(p => p.coin === coin);
    if (position) {
      const isLong = position.side === "long";
      const coinOrders = openOrders.filter(o => o.coin === coin);
      const getOrderType = (order: any): "tp" | "sl" | "other" => {
        const ot = (order.orderType || "").toLowerCase();
        if (ot.includes("take profit") || ot === "take_profit") return "tp";
        if (ot.includes("stop") || ot === "stop_loss") return "sl";
        const px = parseFloat(order.triggerPx || order.limitPx);
        if (!px || isNaN(px)) return "other";
        return isLong ? (px > (position.entryPrice || currentPrice) ? "tp" : "sl") : (px < (position.entryPrice || currentPrice) ? "tp" : "sl");
      };
      const tpOrder = coinOrders.find(o => getOrderType(o) === "tp");
      const slOrder = coinOrders.find(o => getOrderType(o) === "sl");
      const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
      const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

      if (tpPrice) addLine(tpPrice, "#22c55e", `TP`);
      if (position.entryPrice) addLine(position.entryPrice, "#60a5fa", "Entry");
      if (slPrice) addLine(slPrice, "#ef4444", `SL`);
      if (position.liquidationPrice && position.liquidationPrice > 0) addLine(position.liquidationPrice, "#f97316", "Liq.");
    }
  }, [positions, openOrders, coin, currentPrice]);

  const isBullish = smaStatus?.isBullish ?? true;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* ── Main chart (candles + SMAs + volume) ── */}
      <div className="relative flex-[6] min-h-0">
        <div ref={mainContainerRef} className="absolute inset-0" data-testid="pattern-chart" />

        {/* Signal / SMA overlay card — AI card only shown for Pro users */}
        {showSignals && activeSignal ? (
          <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg max-w-xs z-10">
            <div className="flex items-center gap-2 mb-2">
              {activeSignal.bias === "bullish" ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : activeSignal.bias === "bearish" ? (
                <TrendingDown className="h-5 w-5 text-red-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500" />
              )}
              <span className="font-semibold text-sm">{activeSignal.patternName}</span>
              <Badge
                variant={activeSignal.patternStatus === "breakout_watch" ? "default" : activeSignal.patternStatus === "forming" ? "secondary" : "outline"}
                className={`text-xs ${activeSignal.patternStatus === "breakout_watch" ? "bg-amber-600" : activeSignal.patternStatus === "forming" ? "bg-yellow-600" : activeSignal.patternStatus === "developed" ? "bg-green-600" : ""}`}
              >
                {activeSignal.patternStatus === "breakout_watch" ? "WATCH" : activeSignal.patternStatus === "forming" ? "FORMING" : "DEVELOPED"}
              </Badge>
            </div>
            <div className="bg-blue-500/20 border border-blue-500/50 rounded px-2 py-1 mb-2">
              <p className="text-xs text-blue-400 font-medium">Educational - Learn to identify your own entry/exit</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{activeSignal.educationalNote}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-white" />
                <span className="text-muted-foreground">21 SMA:</span>
                <span className="font-mono">${activeSignal.sma21.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#f5e642" }} />
                <span className="text-muted-foreground">200 SMA:</span>
                <span className="font-mono">${activeSignal.sma200.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-medium text-amber-500 mb-1">What to Watch:</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{activeSignal.whatToWatch}</p>
            </div>
            <div className="mt-3 pt-2 border-t flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bias</span>
              <Badge variant={activeSignal.bias === "bullish" ? "default" : activeSignal.bias === "bearish" ? "destructive" : "secondary"}>
                {activeSignal.bias.charAt(0).toUpperCase() + activeSignal.bias.slice(1)}
              </Badge>
            </div>
          </Card>
        ) : (
          <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-0.5 bg-white" />
              <span className="text-sm">21 SMA</span>
              {smaStatus && <span className="font-mono text-xs text-muted-foreground">${smaStatus.sma21.toFixed(2)}</span>}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-0.5" style={{ backgroundColor: "#f5e642" }} />
              <span className="text-sm">200 SMA</span>
              {smaStatus && smaStatus.sma200 > 0 && <span className="font-mono text-xs text-muted-foreground">${smaStatus.sma200.toFixed(2)}</span>}
            </div>
            {smaStatus && (
              <div className={`text-xs border-t pt-2 ${isBullish ? "text-green-500" : "text-red-500"}`}>
                {isBullish ? `21 > 200 on ${interval} - Looking for bullish patterns...` : `21 < 200 on ${interval} - Looking for bearish patterns...`}
              </div>
            )}
            {!smaStatus && <div className="text-xs text-muted-foreground border-t pt-2">Waiting for pattern...</div>}
          </Card>
        )}
      </div>

      {/* ── RSI pane ── */}
      <div className="relative flex-[2] min-h-0 border-t border-white/10">
        <div ref={rsiContainerRef} className="absolute inset-0" />
        <div className="absolute top-0.5 left-1 z-10 pointer-events-none flex items-center gap-2">
          <span className="text-[9px] font-mono text-violet-400 bg-black/40 px-1 rounded">RSI (14)</span>
          <span className="text-[9px] text-red-400/70">70</span>
          <span className="text-[9px] text-green-400/70">30</span>
        </div>
      </div>

      {/* ── Stoch RSI pane ── */}
      <div className="relative flex-[2] min-h-0 border-t border-white/10">
        <div ref={stochContainerRef} className="absolute inset-0" />
        <div className="absolute top-0.5 left-1 z-10 pointer-events-none flex items-center gap-2">
          <span className="text-[9px] font-mono text-sky-400 bg-black/40 px-1 rounded">Stoch RSI</span>
          <span className="text-[9px] text-sky-400/70">K</span>
          <span className="text-[9px] text-orange-400/70">D</span>
        </div>
      </div>
    </div>
  );
}

export const PatternChart = memo(PatternChartComponent);
