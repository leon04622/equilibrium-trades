import { useEffect, useMemo, useState, type RefObject } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { cn } from "@/lib/utils";
import { CHART_PRICE_SCALE_GUTTER } from "@/lib/chart-time";
import {
  formatCandleCountdown,
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

/**
 * TradingView "Countdown to bar close" — small label on the right price scale,
 * vertically aligned with the forming candle's close.
 */
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

  const scaleLabel = useMemo(() => {
    void layoutTick;
    if (!lastCandle) return null;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const pane = paneRef.current;
    if (!chart || !series || !pane) return null;

    const close = parseNum(lastCandle.c);
    const y = series.priceToCoordinate(close);
    if (y == null) return null;

    let gutter = CHART_PRICE_SCALE_GUTTER;
    try {
      const w = chart.priceScale("right").width();
      if (typeof w === "number" && w > 40) gutter = w;
    } catch {
      /* use default */
    }

    const paneW = pane.clientWidth;
    return {
      top: y,
      left: Math.max(0, paneW - gutter + 2),
      width: Math.max(48, gutter - 4),
    };
  }, [lastCandle, chartRef, seriesRef, paneRef, layoutTick]);

  if (!lastCandle || !scaleLabel) return null;

  return (
    <div
      className={cn(
        "absolute z-[30] pointer-events-none flex items-center justify-end",
        className,
      )}
      style={{
        top: scaleLabel.top,
        left: scaleLabel.left,
        width: scaleLabel.width,
        transform: "translateY(-50%)",
      }}
      data-testid="candle-countdown-scale"
    >
      <span
        className={cn(
          "inline-block px-1 py-px text-[11px] font-mono font-normal tabular-nums leading-none",
          "text-[#787b86] bg-[#131722]/90",
        )}
      >
        {formatCandleCountdown(msLeft)}
      </span>
    </div>
  );
}
