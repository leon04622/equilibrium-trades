import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CandlestickPatternImageProps = {
  patternId: string;
  alt: string;
  patternName?: string;
  className?: string;
  imgClassName?: string;
};

type CandleSpec = {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  width?: number;
  color?: string;
};

function CandleGlyph({ x, open, close, high, low, width = 12, color }: CandleSpec) {
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const bodyHeight = Math.max(2, bodyBottom - bodyTop);
  const wickX = x + width / 2;
  const bodyColor = color ?? (close < open ? "#26a69a" : close > open ? "#ef5350" : "#cbd5e1");

  return (
    <g>
      <line
        x1={wickX}
        y1={high}
        x2={wickX}
        y2={low}
        stroke={bodyColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x={x}
        y={bodyTop}
        width={width}
        height={bodyHeight}
        rx="2"
        fill={bodyColor}
      />
    </g>
  );
}

function PatternFrame({
  candles,
  extras,
  imgClassName,
}: {
  candles: CandleSpec[];
  extras?: ReactNode;
  imgClassName?: string;
}) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center p-3", imgClassName)}>
      <svg viewBox="0 0 120 72" className="h-full w-full max-w-[220px]" aria-hidden="true">
        <rect x="0" y="0" width="120" height="72" rx="10" fill="#131722" />
        <line x1="10" y1="60" x2="110" y2="60" stroke="#23304a" strokeWidth="1" />
        {extras}
        {candles.map((candle, index) => (
          <CandleGlyph key={`${candle.x}-${index}`} {...candle} />
        ))}
      </svg>
    </div>
  );
}

function renderCandlestickDiagram(patternId: string): { candles: CandleSpec[]; extras?: ReactNode } {
  switch (patternId) {
    case "hammer":
      return {
        candles: [
          { x: 54, open: 28, close: 24, high: 22, low: 58, color: "#26a69a" },
        ],
      };
    case "inverted-hammer":
      return {
        candles: [
          { x: 54, open: 38, close: 34, high: 12, low: 42, color: "#26a69a" },
        ],
      };
    case "bullish-marubozu":
      return {
        candles: [
          { x: 54, open: 56, close: 16, high: 16, low: 56, color: "#26a69a" },
        ],
      };
    case "dragonfly-doji":
      return {
        candles: [
          { x: 54, open: 24, close: 25, high: 23, low: 58, color: "#cbd5e1" },
        ],
      };
    case "hanging-man":
      return {
        candles: [
          { x: 54, open: 26, close: 30, high: 24, low: 58, color: "#ef5350" },
        ],
      };
    case "shooting-star":
      return {
        candles: [
          { x: 54, open: 38, close: 42, high: 12, low: 44, color: "#ef5350" },
        ],
      };
    case "bearish-marubozu":
      return {
        candles: [
          { x: 54, open: 16, close: 56, high: 16, low: 56, color: "#ef5350" },
        ],
      };
    case "gravestone-doji":
      return {
        candles: [
          { x: 54, open: 46, close: 47, high: 12, low: 48, color: "#cbd5e1" },
        ],
      };
    case "doji":
      return {
        candles: [
          { x: 54, open: 34, close: 35, high: 18, low: 54, color: "#cbd5e1" },
        ],
      };
    case "spinning-top":
      return {
        candles: [
          { x: 54, open: 30, close: 40, high: 16, low: 56, color: "#cbd5e1" },
        ],
      };
    case "bullish-engulfing":
      return {
        candles: [
          { x: 34, open: 24, close: 40, high: 20, low: 44, color: "#ef5350" },
          { x: 60, open: 46, close: 16, high: 14, low: 50, color: "#26a69a" },
        ],
      };
    case "piercing-line":
      return {
        candles: [
          { x: 34, open: 18, close: 42, high: 16, low: 46, color: "#ef5350" },
          { x: 60, open: 50, close: 24, high: 48, low: 54, color: "#26a69a" },
        ],
      };
    case "tweezer-bottom":
      return {
        candles: [
          { x: 34, open: 24, close: 42, high: 20, low: 52, color: "#ef5350" },
          { x: 60, open: 40, close: 20, high: 18, low: 52, color: "#26a69a" },
        ],
      };
    case "bullish-harami":
      return {
        candles: [
          { x: 34, open: 18, close: 44, high: 14, low: 48, color: "#ef5350" },
          { x: 62, open: 36, close: 26, high: 24, low: 38, color: "#26a69a" },
        ],
      };
    case "bearish-engulfing":
      return {
        candles: [
          { x: 34, open: 42, close: 20, high: 18, low: 46, color: "#26a69a" },
          { x: 60, open: 16, close: 48, high: 14, low: 52, color: "#ef5350" },
        ],
      };
    case "dark-cloud-cover":
      return {
        candles: [
          { x: 34, open: 42, close: 16, high: 14, low: 46, color: "#26a69a" },
          { x: 60, open: 12, close: 34, high: 10, low: 38, color: "#ef5350" },
        ],
      };
    case "tweezer-top":
      return {
        candles: [
          { x: 34, open: 42, close: 20, high: 18, low: 46, color: "#26a69a" },
          { x: 60, open: 20, close: 40, high: 18, low: 44, color: "#ef5350" },
        ],
      };
    case "bearish-harami":
      return {
        candles: [
          { x: 34, open: 42, close: 16, high: 14, low: 46, color: "#26a69a" },
          { x: 62, open: 24, close: 34, high: 22, low: 36, color: "#ef5350" },
        ],
      };
    case "morning-star":
    case "morning-doji-star":
      return {
        candles: [
          { x: 18, open: 16, close: 44, high: 14, low: 48, color: "#ef5350" },
          patternId === "morning-doji-star"
            ? { x: 48, open: 46, close: 47, high: 44, low: 50, color: "#cbd5e1" }
            : { x: 48, open: 42, close: 46, high: 40, low: 50, color: "#cbd5e1" },
          { x: 78, open: 44, close: 18, high: 16, low: 48, color: "#26a69a" },
        ],
      };
    case "three-white-soldiers":
      return {
        candles: [
          { x: 18, open: 50, close: 30, high: 28, low: 54, color: "#26a69a" },
          { x: 48, open: 42, close: 22, high: 20, low: 46, color: "#26a69a" },
          { x: 78, open: 34, close: 14, high: 12, low: 38, color: "#26a69a" },
        ],
      };
    case "three-inside-up":
      return {
        candles: [
          { x: 18, open: 18, close: 46, high: 14, low: 50, color: "#ef5350" },
          { x: 48, open: 40, close: 30, high: 28, low: 42, color: "#26a69a" },
          { x: 78, open: 34, close: 14, high: 12, low: 38, color: "#26a69a" },
        ],
      };
    case "evening-star":
    case "evening-doji-star":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#26a69a" },
          patternId === "evening-doji-star"
            ? { x: 48, open: 16, close: 17, high: 14, low: 20, color: "#cbd5e1" }
            : { x: 48, open: 18, close: 22, high: 16, low: 26, color: "#cbd5e1" },
          { x: 78, open: 20, close: 46, high: 18, low: 50, color: "#ef5350" },
        ],
      };
    case "three-black-crows":
      return {
        candles: [
          { x: 18, open: 20, close: 40, high: 18, low: 44, color: "#ef5350" },
          { x: 48, open: 28, close: 48, high: 26, low: 52, color: "#ef5350" },
          { x: 78, open: 36, close: 56, high: 34, low: 60, color: "#ef5350" },
        ],
      };
    case "three-inside-down":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#26a69a" },
          { x: 48, open: 24, close: 34, high: 22, low: 36, color: "#ef5350" },
          { x: 78, open: 30, close: 52, high: 28, low: 56, color: "#ef5350" },
        ],
      };
    case "abandoned-baby-bullish":
      return {
        candles: [
          { x: 18, open: 18, close: 44, high: 16, low: 48, color: "#ef5350" },
          { x: 50, open: 52, close: 53, high: 50, low: 56, color: "#cbd5e1" },
          { x: 82, open: 42, close: 16, high: 14, low: 46, color: "#26a69a" },
        ],
      };
    case "abandoned-baby-bearish":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#26a69a" },
          { x: 50, open: 10, close: 11, high: 8, low: 14, color: "#cbd5e1" },
          { x: 82, open: 20, close: 46, high: 18, low: 50, color: "#ef5350" },
        ],
      };
    default:
      return {
        candles: [
          { x: 24, open: 44, close: 24, high: 20, low: 50, color: "#26a69a" },
          { x: 54, open: 24, close: 44, high: 20, low: 50, color: "#ef5350" },
          { x: 84, open: 34, close: 35, high: 22, low: 50, color: "#cbd5e1" },
        ],
      };
  }
}

export function CandlestickPatternImage({
  patternId,
  alt,
  className,
  imgClassName,
}: CandlestickPatternImageProps) {
  const { candles, extras } = useMemo(() => renderCandlestickDiagram(patternId), [patternId]);

  return (
    <div className={cn("relative overflow-hidden bg-muted/30", className)} role="img" aria-label={alt}>
      <PatternFrame candles={candles} extras={extras} imgClassName={imgClassName} />
    </div>
  );
}
