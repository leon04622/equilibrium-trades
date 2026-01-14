import { useEffect, useRef, useState, memo } from "react";
import { 
  createChart, 
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type ISeriesMarkersPluginApi,
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
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
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
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const { theme } = useTheme();
  const [activeSignal, setActiveSignal] = useState<PatternSignal | null>(null);

  const coin = symbol.replace("USDT", "").replace("BINANCE:", "");

  const { data: candles } = useQuery<CandleData[]>({
    queryKey: ["/api/hyperliquid/candles", coin, interval],
    refetchInterval: 10000,
  });

  const { data: signals } = useQuery<PatternSignal[]>({
    queryKey: ["/api/signals/crossover", interval],
    refetchInterval: 30000,
  });

  const currentSignal = signals?.find(s => s.coin === coin && s.timeframe === interval);

  useEffect(() => {
    if (currentSignal) {
      setActiveSignal(currentSignal);
    } else {
      setActiveSignal(null);
    }
  }, [currentSignal]);

  function calculateSMA(data: CandleData[], period: number): { time: Time; value: number }[] {
    const result: { time: Time; value: number }[] = [];
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].c;
      }
      result.push({
        time: (data[i].t / 1000) as Time,
        value: sum / period,
      });
    }
    return result;
  }

  function findCrossoverPoints(
    sma21Data: { time: Time; value: number }[], 
    sma200Data: { time: Time; value: number }[]
  ): { time: Time; price: number; type: "bullish" | "bearish" }[] {
    const crossovers: { time: Time; price: number; type: "bullish" | "bearish" }[] = [];
    
    const sma200Map = new Map(sma200Data.map(d => [d.time, d.value]));
    
    for (let i = 1; i < sma21Data.length; i++) {
      const curr21 = sma21Data[i].value;
      const prev21 = sma21Data[i - 1].value;
      const curr200 = sma200Map.get(sma21Data[i].time);
      const prev200 = sma200Map.get(sma21Data[i - 1].time);
      
      if (curr21 === undefined || prev21 === undefined || curr200 === undefined || prev200 === undefined) continue;
      
      if (prev21 <= prev200 && curr21 > curr200) {
        crossovers.push({ time: sma21Data[i].time, price: curr21, type: "bullish" });
      }
      if (prev21 >= prev200 && curr21 < curr200) {
        crossovers.push({ time: sma21Data[i].time, price: curr21, type: "bearish" });
      }
    }
    
    return crossovers;
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
      },
      timeScale: {
        borderColor: isDark ? "#30363d" : "#d0d7de",
        timeVisible: true,
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

    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

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
      markersPluginRef.current = null;
      chart.remove();
    };
  }, [theme]);

  useEffect(() => {
    if (!candles || !candleSeriesRef.current || !sma21SeriesRef.current || !sma200SeriesRef.current) return;

    const sortedCandles = [...candles].sort((a, b) => a.t - b.t);

    const candleData = sortedCandles.map(c => ({
      time: (c.t / 1000) as Time,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));

    candleSeriesRef.current.setData(candleData);

    if (sortedCandles.length >= 21) {
      const sma21Data = calculateSMA(sortedCandles, 21);
      sma21SeriesRef.current.setData(sma21Data);
    }

    if (sortedCandles.length >= 200) {
      const sma200Data = calculateSMA(sortedCandles, 200);
      sma200SeriesRef.current.setData(sma200Data);

      const sma21Data = calculateSMA(sortedCandles, 21);
      const crossovers = findCrossoverPoints(sma21Data, sma200Data);
      
      if (markersPluginRef.current) {
        if (crossovers.length > 0) {
          const markers: SeriesMarker<Time>[] = crossovers.map(c => ({
            time: c.time,
            position: c.type === "bullish" ? "belowBar" as const : "aboveBar" as const,
            color: c.type === "bullish" ? "#22c55e" : "#ef4444",
            shape: "circle" as const,
            text: c.type === "bullish" ? "21 crossed above 200" : "21 crossed below 200",
            size: 2,
          }));
          markersPluginRef.current.setMarkers(markers);
        } else {
          markersPluginRef.current.setMarkers([]);
        }
      }
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [candles]);

  useEffect(() => {
    if (!candleSeriesRef.current || !activeSignal) return;

    const series = candleSeriesRef.current;

    if (activeSignal.suggestedSL) {
      series.createPriceLine({
        price: activeSignal.suggestedSL,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "SL",
      });
    }

    if (activeSignal.suggestedTP) {
      series.createPriceLine({
        price: activeSignal.suggestedTP,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "TP",
      });
    }

    if (activeSignal.entryPrice) {
      series.createPriceLine({
        price: activeSignal.entryPrice,
        color: "#f59e0b",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "Entry",
      });
    }
  }, [activeSignal?.id]);

  const isBullish = activeSignal?.type.includes("bullish");

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
              {activeSignal.patternType || activeSignal.type.replace("_", " ").toUpperCase()}
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
        <div className="absolute top-4 left-4 p-3 bg-background/80 backdrop-blur-sm rounded-lg border text-sm text-muted-foreground">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-0.5 bg-orange-500" />
            <span>21 SMA</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span>200 SMA</span>
          </div>
          <p className="mt-2 text-xs">Waiting for pattern...</p>
        </div>
      )}
    </div>
  );
}

export const PatternChart = memo(PatternChartComponent);
