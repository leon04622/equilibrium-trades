import { useEffect, useRef, useState, memo, useCallback } from "react";
import { 
  createChart, 
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, AlertCircle } from "lucide-react";

interface PatternSignal {
  id: string;
  coin: string;
  type: string;
  status: string;
  timeframe: string;
  sma21: number;
  sma200: number;
  currentPrice: number;
  entryPrice: number;
  suggestedSL: number;
  suggestedTP: number;
  confidence: number;
  detectedAt: string;
  description: string;
  patternType?: string;
}

interface PatternChartProps {
  symbol: string;
  interval?: string;
  className?: string;
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
  className = ""
}: PatternChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<CandlestickSeriesType | null>(null);
  const sma21SeriesRef = useRef<LineSeriesType | null>(null);
  const sma200SeriesRef = useRef<LineSeriesType | null>(null);
  const priceLineRefs = useRef<any[]>([]);
  const isInitialLoadRef = useRef(true);
  const { theme } = useTheme();
  const [activeSignal, setActiveSignal] = useState<PatternSignal | null>(null);
  const [smaStatus, setSmaStatus] = useState<{ sma21: number; sma200: number; isBullish: boolean } | null>(null);

  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  const { data: candles } = useQuery<CandleData[]>({
    queryKey: [`/api/hyperliquid/candles/${coin}?interval=${interval}`],
    refetchInterval: 10000,
  });

  const { data: signals } = useQuery<PatternSignal[]>({
    queryKey: [`/api/signals/crossover?timeframes=${interval}`],
    refetchInterval: 30000,
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
      const signalIsBullish = currentSignal.type.includes("bullish");
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
        vertLines: { color: isDark ? "#21262d" : "#e1e4e8" },
        horzLines: { color: isDark ? "#21262d" : "#e1e4e8" },
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
      color: "#f7931a",
      lineWidth: 2,
      title: "21 SMA",
    });
    sma21SeriesRef.current = sma21Series;

    const sma200Series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      title: "200 SMA",
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
      const sma200Data = calculateSMA(sortedCandles, sortedCandles.length);
      sma200SeriesRef.current.setData(sma200Data);
    }

    if (chartRef.current && isInitialLoadRef.current) {
      chartRef.current.timeScale().fitContent();
      isInitialLoadRef.current = false;
    }
  }, [candles, parsePrice]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const series = candleSeriesRef.current;
    
    priceLineRefs.current.forEach(line => {
      try {
        series.removePriceLine(line);
      } catch (e) {}
    });
    priceLineRefs.current = [];

    if (!activeSignal) return;

    if (activeSignal.entryPrice) {
      const entryLine = series.createPriceLine({
        price: activeSignal.entryPrice,
        color: "#f59e0b",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "Entry",
      });
      priceLineRefs.current.push(entryLine);
    }

    if (activeSignal.suggestedSL) {
      const slLine = series.createPriceLine({
        price: activeSignal.suggestedSL,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "SL",
      });
      priceLineRefs.current.push(slLine);
    }

    if (activeSignal.suggestedTP) {
      const tpLine = series.createPriceLine({
        price: activeSignal.suggestedTP,
        color: "#22c55e",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: "TP",
      });
      priceLineRefs.current.push(tpLine);
    }
  }, [activeSignal]);

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
            {isBullish ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <span className="font-semibold text-sm">
              {activeSignal.patternType || patternName}
            </span>
            <Badge 
              variant={activeSignal.status === "breakout" ? "default" : activeSignal.status === "forming" ? "secondary" : "outline"}
              className={`text-xs ${activeSignal.status === "breakout" ? "bg-green-600" : activeSignal.status === "forming" ? "bg-yellow-600" : ""}`}
            >
              {activeSignal.status === "breakout" ? "ENTRY NOW" : activeSignal.status === "forming" ? "WAIT" : activeSignal.status}
            </Badge>
          </div>
          
          {activeSignal.status === "forming" && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded px-2 py-1 mb-2">
              <p className="text-xs text-yellow-500 font-medium">
                Pattern forming - DO NOT ENTER yet. Wait for breakout!
              </p>
            </div>
          )}
          
          {activeSignal.status === "breakout" && (
            <div className="bg-green-500/20 border border-green-500/50 rounded px-2 py-1 mb-2">
              <p className="text-xs text-green-500 font-medium">
                Breakout confirmed - Entry signal active!
              </p>
            </div>
          )}
          
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {activeSignal.description}
          </p>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-muted-foreground">21 SMA:</span>
              <span className="font-mono">${activeSignal.sma21.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">200 SMA:</span>
              <span className="font-mono">${activeSignal.sma200.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Target className="h-3 w-3" /> {activeSignal.status === "forming" ? "Entry (on breakout)" : "Entry"}
              </span>
              <span className="font-mono text-amber-500">${activeSignal.entryPrice.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <AlertCircle className="h-3 w-3" /> Stop Loss
              </span>
              <span className="font-mono text-red-500">${activeSignal.suggestedSL.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Target className="h-3 w-3" /> Take Profit
              </span>
              <span className="font-mono text-green-500">${activeSignal.suggestedTP.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Risk:Reward</span>
              <Badge variant="outline" className="font-mono">
                {activeSignal.suggestedTP && activeSignal.suggestedSL && activeSignal.entryPrice ? (
                  (() => {
                    const isBull = activeSignal.type.includes("bullish");
                    const risk = isBull 
                      ? activeSignal.entryPrice - activeSignal.suggestedSL
                      : activeSignal.suggestedSL - activeSignal.entryPrice;
                    const reward = isBull
                      ? activeSignal.suggestedTP - activeSignal.entryPrice
                      : activeSignal.entryPrice - activeSignal.suggestedTP;
                    const rr = risk > 0 ? (reward / risk).toFixed(1) : "0";
                    return `${rr}:1`;
                  })()
                ) : "N/A"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <Badge variant={activeSignal.confidence >= 70 ? "default" : "secondary"}>
                {activeSignal.confidence}%
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {!activeSignal && (
        <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-0.5 bg-orange-500" />
            <span className="text-sm">21 SMA</span>
            {smaStatus && (
              <span className="font-mono text-xs text-muted-foreground">
                ${smaStatus.sma21.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-0.5 bg-blue-500" />
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
                ? `21 > 200 on ${interval} - Looking for bull flags...`
                : `21 < 200 on ${interval} - Looking for bear flags...`}
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
