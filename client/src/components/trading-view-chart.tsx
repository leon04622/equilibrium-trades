import { useEffect, useRef, memo, useCallback } from "react";
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
import { useTrading } from "@/lib/trading-context";
import { useQuery } from "@tanstack/react-query";

interface TradingViewChartProps {
  symbol?: string;
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

// Map TradingView-style intervals to Hyperliquid intervals
const INTERVAL_MAP: Record<string, string> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "D": "1d",
  "1D": "1d",
};

function calcSMA(
  data: CandleData[],
  period: number,
  parse: (v: number | string) => number
): { time: Time; value: number }[] {
  const result: { time: Time; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += parse(data[i - j].c);
    result.push({ time: (data[i].t / 1000) as Time, value: sum / period });
  }
  return result;
}

function TradingViewChartComponent({
  symbol = "BINANCE:BTCUSDT",
  interval = "5",
  className = "",
  currentPrice = 0,
}: TradingViewChartProps) {
  const { theme } = useTheme();
  const { positions, openOrders, indicators } = useTrading();

  // Derive coin from symbol (e.g. "BINANCE:BTCUSDT" → "BTC")
  const coin = symbol.replace("BINANCE:", "").replace("USDT", "");
  const hlInterval = INTERVAL_MAP[interval] ?? "5m";

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sma21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLineRefs = useRef<IPriceLine[]>([]);
  const isInitialLoadRef = useRef(true);

  const parsePrice = useCallback(
    (v: number | string) => (typeof v === "string" ? parseFloat(v) : v),
    []
  );

  const { data: candles } = useQuery<CandleData[]>({
    queryKey: [`/api/hyperliquid/candles/${coin}?interval=${hlInterval}`],
    refetchInterval: 5000,
  });

  // ── Create / destroy chart when theme changes ──────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "dark";
    const bg = isDark ? "#0d1117" : "#ffffff";
    const text = isDark ? "#848e9c" : "#555";
    const grid = isDark ? "#1a1f2e" : "#f0f0f0";
    const border = isDark ? "#2a2f3e" : "#d0d0d0";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: border,
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        rightOffset: 8,
        barSpacing: 8,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
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

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    sma21Ref.current = chart.addSeries(LineSeries, {
      color: "#f7931a",
      lineWidth: 1,
      title: "SMA 21",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    sma200Ref.current = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      title: "SMA 200",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    isInitialLoadRef.current = true;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    handleResize();

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      sma21Ref.current = null;
      sma200Ref.current = null;
      priceLineRefs.current = [];
    };
  }, [theme]);

  // ── Feed candle data + SMAs ────────────────────────────────────────────────
  useEffect(() => {
    if (!candles || !candleSeriesRef.current || !sma21Ref.current || !sma200Ref.current) return;

    const sorted = [...candles].sort((a, b) => a.t - b.t);

    candleSeriesRef.current.setData(
      sorted.map((c) => ({
        time: (c.t / 1000) as Time,
        open: parsePrice(c.o),
        high: parsePrice(c.h),
        low: parsePrice(c.l),
        close: parsePrice(c.c),
      }))
    );

    if (sorted.length >= 21) {
      sma21Ref.current.setData(calcSMA(sorted, 21, parsePrice));
    }
    if (sorted.length >= 200) {
      sma200Ref.current.setData(calcSMA(sorted, 200, parsePrice));
    } else if (sorted.length >= 50) {
      sma200Ref.current.setData(calcSMA(sorted, sorted.length, parsePrice));
    }

    if (chartRef.current && isInitialLoadRef.current) {
      chartRef.current.timeScale().fitContent();
      isInitialLoadRef.current = false;
    }
  }, [candles, parsePrice]);

  // ── Draw TP / SL / Entry / Liq price lines on the chart ───────────────────
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear previous lines
    priceLineRefs.current.forEach((pl) => {
      try { series.removePriceLine(pl); } catch (_) {}
    });
    priceLineRefs.current = [];

    const position = positions.find((p) => p.coin === coin);
    if (!position) return;

    const isLong = position.side === "long";
    const coinOrders = openOrders.filter((o) => o.coin === coin);

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

    const tpOrder = coinOrders.find((o) => getOrderType(o) === "tp");
    const slOrder = coinOrders.find((o) => getOrderType(o) === "sl");
    const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
    const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;

    const add = (price: number, color: string, title: string) => {
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

    if (tpPrice) add(tpPrice, "#22c55e", `TP ${isLong ? ">" : "<"} ${tpPrice}`);
    if (position.entryPrice) add(position.entryPrice, "#60a5fa", `Entry`);
    if (slPrice) add(slPrice, "#ef4444", `SL ${isLong ? "<" : ">"} ${slPrice}`);
    if (position.liquidationPrice && position.liquidationPrice > 0) {
      add(position.liquidationPrice, "#f97316", `Liq.`);
    }
  }, [positions, openOrders, coin, currentPrice]);

  return (
    <div
      className={`relative ${className}`}
      style={{ height: "100%", width: "100%" }}
      data-testid="tradingview-chart"
    >
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartComponent);
