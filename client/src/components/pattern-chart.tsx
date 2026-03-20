import { useEffect, useRef, useState, memo, useCallback } from "react";
import { 
  createChart, 
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
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
import { TrendingUp, TrendingDown, Target, AlertCircle } from "lucide-react";

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
}

interface CandleData {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v: number | string;
}

type CandlestickSeriesType = ISeriesApi<"Candlestick">;
type LineSeriesType = ISeriesApi<"Line">;

function PatternChartComponent({ 
  symbol = "BTC", 
  interval = "5m",
  className = "",
  currentPrice = 0,
}: PatternChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<CandlestickSeriesType | null>(null);
  const sma21SeriesRef = useRef<LineSeriesType | null>(null);
  const sma200SeriesRef = useRef<LineSeriesType | null>(null);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const isInitialLoadRef = useRef(true);
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
  });

  const parsePrice = useCallback((val: number | string): number => {
    return typeof val === 'string' ? parseFloat(val) : val;
  }, []);

  function calculateSMA(data: CandleData[], period: number): { time: Time; value: number }[] {
    const result: { time: Time; value: number }[] = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum = sum + parsePrice(data[i - j].c);
      }
      result.push({
        time: (data[i].t / 1000) as Time,
        value: sum / period,
      });
    }
    return result;
  }

  useEffect(() => {
    if (!candles || candles.length < 21) {
      setSmaStatus(null);
      return;
    }

    const sortedCandles = [...candles].sort((a, b) => a.t - b.t);
    const sma21Data = calculateSMA(sortedCandles, 21);
    
    const availableFor200 = Math.min(sortedCandles.length, 200);
    const sma200Data = sortedCandles.length >= availableFor200 
      ? calculateSMA(sortedCandles, availableFor200)
      : [];

    if (sma21Data.length > 0 && sma200Data.length > 0) {
      const latestSma21 = sma21Data[sma21Data.length - 1].value;
      const latestSma200 = sma200Data[sma200Data.length - 1].value;
      setSmaStatus({
        sma21: latestSma21,
        sma200: latestSma200,
        isBullish: latestSma21 > latestSma200,
      });
    } else if (sma21Data.length > 0) {
      const latestSma21 = sma21Data[sma21Data.length - 1].value;
      setSmaStatus({
        sma21: latestSma21,
        sma200: 0,
        isBullish: true,
      });
    }
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

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "dark";
    
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#0d1117" : "#ffffff" },
        textColor: isDark ? "#c9d1d9" : "#24292f",
      },
      grid: {
        vertLines: { color: isDark ? "#21262d" : "#e1e4e8", style: LineStyle.Solid },
        horzLines: { color: isDark ? "#21262d" : "#e1e4e8", style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isDark ? "#30363d" : "#d0d7de",
        autoScale: true,
      },
      timeScale: {
        borderColor: isDark ? "#30363d" : "#d0d7de",
        timeVisible: true,
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    candleSeriesRef.current = candleSeries;

    const sma21Series = chart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: "21 SMA",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    sma21SeriesRef.current = sma21Series;

    const sma200Series = chart.addSeries(LineSeries, {
      color: "#f5e642",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      title: "200 SMA",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    sma200SeriesRef.current = sma200Series;

    isInitialLoadRef.current = true;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ 
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [theme]);

  useEffect(() => {
    if (!candles || !candleSeriesRef.current || !sma21SeriesRef.current || !sma200SeriesRef.current) return;

    const sortedCandles = [...candles].sort((a, b) => a.t - b.t);

    const candleData = sortedCandles.map(c => ({
      time: (c.t / 1000) as Time,
      open: parsePrice(c.o),
      high: parsePrice(c.h),
      low: parsePrice(c.l),
      close: parsePrice(c.c),
    }));

    candleSeriesRef.current.setData(candleData);

    if (sortedCandles.length >= 21) {
      const sma21Data = calculateSMA(sortedCandles, 21);
      sma21SeriesRef.current.setData(sma21Data);
    }

    if (sortedCandles.length >= 200) {
      const sma200Data = calculateSMA(sortedCandles, 200);
      sma200SeriesRef.current.setData(sma200Data);
    } else if (sortedCandles.length >= 50) {
      // Use a period that leaves enough points to draw a visible line
      const period = Math.max(10, Math.floor(sortedCandles.length * 0.6));
      const sma200Data = calculateSMA(sortedCandles, period);
      sma200SeriesRef.current.setData(sma200Data);
    }

    if (chartRef.current && isInitialLoadRef.current) {
      chartRef.current.timeScale().fitContent();
      isInitialLoadRef.current = false;
    }
  }, [candles, parsePrice]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear previous lines
    priceLineRefs.current.forEach(line => {
      try { series.removePriceLine(line); } catch (_) {}
    });
    priceLineRefs.current = [];

    const addLine = (price: number, color: string, title: string) => {
      if (!price || isNaN(price) || price <= 0) return;
      const pl = series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
      priceLineRefs.current.push(pl);
    };

    // Draw TP / SL / Entry / Liq from trading position
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
        return isLong
          ? px > (position.entryPrice || currentPrice) ? "tp" : "sl"
          : px < (position.entryPrice || currentPrice) ? "tp" : "sl";
      };

      const tpOrder = coinOrders.find(o => getOrderType(o) === "tp");
      const slOrder = coinOrders.find(o => getOrderType(o) === "sl");
      const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
      const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

      if (tpPrice) addLine(tpPrice, "#22c55e", `TP ${isLong ? ">" : "<"} ${tpPrice}`);
      if (position.entryPrice) addLine(position.entryPrice, "#60a5fa", "Entry");
      if (slPrice) addLine(slPrice, "#ef4444", `SL ${isLong ? "<" : ">"} ${slPrice}`);
      if (position.liquidationPrice && position.liquidationPrice > 0) {
        addLine(position.liquidationPrice, "#f97316", "Liq.");
      }
    }
  }, [positions, openOrders, coin, currentPrice]);

  const isBullish = smaStatus?.isBullish ?? true;
  const patternName = isBullish ? "Potential Bull Flag" : "Potential Bear Flag";

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={containerRef} 
        className="w-full h-full min-h-[400px]"
        data-testid="pattern-chart"
      />
      
      {activeSignal && (
        <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg max-w-xs z-10">
          <div className="flex items-center gap-2 mb-2">
            {activeSignal.bias === "bullish" ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : activeSignal.bias === "bearish" ? (
              <TrendingDown className="h-5 w-5 text-red-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            )}
            <span className="font-semibold text-sm">
              {activeSignal.patternName}
            </span>
            <Badge 
              variant={activeSignal.patternStatus === "breakout_watch" ? "default" : activeSignal.patternStatus === "forming" ? "secondary" : "outline"}
              className={`text-xs ${activeSignal.patternStatus === "breakout_watch" ? "bg-amber-600" : activeSignal.patternStatus === "forming" ? "bg-yellow-600" : activeSignal.patternStatus === "developed" ? "bg-green-600" : ""}`}
            >
              {activeSignal.patternStatus === "breakout_watch" ? "WATCH" : activeSignal.patternStatus === "forming" ? "FORMING" : "DEVELOPED"}
            </Badge>
          </div>
          
          <div className="bg-blue-500/20 border border-blue-500/50 rounded px-2 py-1 mb-2">
            <p className="text-xs text-blue-400 font-medium">
              Educational - Learn to identify your own entry/exit
            </p>
          </div>
          
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {activeSignal.educationalNote}
          </p>
          
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
            <p className="text-xs text-muted-foreground leading-relaxed">
              {activeSignal.whatToWatch}
            </p>
          </div>

          <div className="mt-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bias</span>
              <Badge variant={activeSignal.bias === "bullish" ? "default" : activeSignal.bias === "bearish" ? "destructive" : "secondary"}>
                {activeSignal.bias.charAt(0).toUpperCase() + activeSignal.bias.slice(1)}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {!activeSignal && (
        <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-0.5 bg-white" />
            <span className="text-sm">21 SMA</span>
            {smaStatus && (
              <span className="font-mono text-xs text-muted-foreground">
                ${smaStatus.sma21.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-0.5" style={{ backgroundColor: "#f5e642" }} />
            <span className="text-sm">200 SMA</span>
            {smaStatus && smaStatus.sma200 > 0 && (
              <span className="font-mono text-xs text-muted-foreground">
                ${smaStatus.sma200.toFixed(2)}
              </span>
            )}
          </div>
          
          {smaStatus && (
            <div className={`text-xs border-t pt-2 ${isBullish ? "text-green-500" : "text-red-500"}`}>
              {isBullish 
                ? `21 > 200 on ${interval} - Looking for bullish patterns...`
                : `21 < 200 on ${interval} - Looking for bearish patterns...`}
            </div>
          )}
          {!smaStatus && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              Waiting for pattern...
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export const PatternChart = memo(PatternChartComponent);
