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

interface SMAStatus {
  coin: string;
  sma21: number;
  sma200: number;
  isBullish: boolean;
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
  const [is5mBullish, setIs5mBullish] = useState<boolean>(false);

  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  const { data: candles } = useQuery<CandleData[]>({
    queryKey: [`/api/hyperliquid/candles/${coin}?interval=${interval}`],
    refetchInterval: 10000,
  });

  const { data: sma5mStatus } = useQuery<SMAStatus>({
    queryKey: [`/api/signals/sma-status/${coin}?timeframe=5m`],
    refetchInterval: 30000,
  });

  const { data: signals } = useQuery<PatternSignal[]>({
    queryKey: [`/api/signals/crossover?timeframes=${interval}`],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (sma5mStatus) {
      setIs5mBullish(sma5mStatus.isBullish);
    }
  }, [sma5mStatus]);

  const currentSignal = signals?.find(s => s.coin === coin && s.timeframe === interval);

  useEffect(() => {
    if (currentSignal && is5mBullish) {
      setActiveSignal(currentSignal);
    } else {
      setActiveSignal(null);
    }
  }, [currentSignal, is5mBullish]);

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

  const isBullish = activeSignal?.type.includes("bullish");

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={containerRef} 
        className="w-full h-full min-h-[400px]"
        data-testid="pattern-chart"
      />
      
      {activeSignal && is5mBullish && (
        <Card className="absolute top-4 left-4 p-3 bg-background/90 backdrop-blur-sm border shadow-lg max-w-xs z-10">
          <div className="flex items-center gap-2 mb-2">
            {isBullish ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <span className="font-semibold text-sm">
              {activeSignal.patternType || "Potential Bull Flag"}
            </span>
            <Badge 
              variant={activeSignal.status === "confirmed" ? "default" : "secondary"}
              className="text-xs"
            >
              {activeSignal.status}
            </Badge>
          </div>
          
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
                <Target className="h-3 w-3" /> Entry
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
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <Badge variant={activeSignal.confidence >= 80 ? "default" : "secondary"}>
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
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-sm">200 SMA</span>
          </div>
          
          {!is5mBullish && (
            <div className="text-xs text-amber-500 border-t pt-2">
              Waiting for 21 SMA to cross above 200 SMA on 5m...
            </div>
          )}
          {is5mBullish && (
            <div className="text-xs text-green-500 border-t pt-2">
              5m bullish - watching for pattern...
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export const PatternChart = memo(PatternChartComponent);
