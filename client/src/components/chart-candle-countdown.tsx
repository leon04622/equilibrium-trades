import { useEffect, useMemo, useState, type RefObject } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { cn } from "@/lib/utils";
import {
  formatCandleCountdown,
  intervalShortLabel,
  intervalToSeconds,
  msUntilCandleClose,
} from "@/lib/candle-countdown";

type CandleRow = {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
};

type ChartCandleCountdownProps = {
  interval: string;
  candles: CandleRow[] | undefined;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  paneRef: RefObject<HTMLDivElement | null>;
  layoutTick?: number;
  className?: string;
};

function parseNum(v: number | string): number {
  return typeof v === "number" ? v : parseFloat(String(v));
}

export function ChartCandleCountdown({
  interval,
  candles,
  chartRef,
  seriesRef,
  paneRef,
  layoutTick = 0,
  className,
}: ChartCandleCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastCandle = candles?.length ? candles[candles.length - 1] : null;

  const msLeft = lastCandle
    ? msUntilCandleClose(lastCandle.t, interval, now)
    : 0;

  const barPosition = useMemo(() => {
    void layoutTick;
    if (!lastCandle) return null;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;

    const time = (lastCandle.t / 1000) as Time;
    const x = chart.timeScale().timeToCoordinate(time);
    const high = parseNum(lastCandle.h);
    const y = series.priceToCoordinate(high);
    if (x == null || y == null) return null;
    return { x, y };
  }, [lastCandle, chartRef, seriesRef, layoutTick]);

  const progress =
    lastCandle && intervalToSeconds(interval) > 0
      ? 1 - msLeft / (intervalToSeconds(interval) * 1000)
      : 0;

  if (!lastCandle) return null;

  return (
    <>
      {/* TradingView-style clock — top center of chart */}
      <div
        className={cn(
          "absolute top-2 left-1/2 -translate-x-1/2 z-[35] pointer-events-none",
          "flex items-center gap-2 rounded-md border border-[#363a45] bg-[#131722]/95 px-2.5 py-1 shadow-md",
          className,
        )}
        data-testid="candle-countdown-clock"
      >
        <span className="text-[10px] text-[#787b86] uppercase tracking-wide">
          {intervalShortLabel(interval)}
        </span>
        <span className="text-sm font-mono font-semibold text-[#d1d4dc] tabular-nums">
          {formatCandleCountdown(msLeft)}
        </span>
        <div className="w-16 h-1 rounded-full bg-[#2a2e39] overflow-hidden">
          <div
            className="h-full bg-[#2962ff] transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Label on the active (last) candle */}
      {barPosition ? (
        <div
          className="absolute z-[34] pointer-events-none -translate-x-1/2"
          style={{
            left: barPosition.x,
            top: Math.max(4, barPosition.y - 22),
          }}
          data-testid="candle-countdown-on-bar"
        >
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums bg-[#2962ff] text-white shadow">
            {formatCandleCountdown(msLeft)}
          </span>
        </div>
      ) : null}
    </>
  );
}
