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

type DiagramSpec = {
  candles: CandleSpec[];
  extras?: ReactNode;
  focus?: { x: number; width: number };
};

/** Bullish / bearish bodies; wicks stay neutral (screenshot-style library charts). */
const CANDLE_BULL = "#00c853";
const CANDLE_BEAR = "#ff5252";
const CANDLE_NEUTRAL = "#94a3b8";
const CANDLE_WICK = "#e0e0e0";

function CandleGlyph({ x, open, close, high, low, width = 12, color }: CandleSpec) {
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const bodyHeight = Math.max(2, bodyBottom - bodyTop);
  const wickX = x + width / 2;
  const bodyColor =
    color === "#cbd5e1"
      ? CANDLE_NEUTRAL
      : (color ?? (close < open ? CANDLE_BULL : close > open ? CANDLE_BEAR : CANDLE_NEUTRAL));

  return (
    <g>
      <line x1={wickX} y1={high} x2={wickX} y2={low} stroke={CANDLE_WICK} strokeWidth="1" />
      <rect x={x} y={bodyTop} width={width} height={bodyHeight} fill={bodyColor} />
    </g>
  );
}

function PatternFrame({
  candles,
  extras,
  focus,
  imgClassName,
}: {
  candles: CandleSpec[];
  extras?: ReactNode;
  focus?: { x: number; width: number };
  imgClassName?: string;
}) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center p-3", imgClassName)}>
      <svg viewBox="0 0 160 96" className="h-full w-full max-w-[260px]" aria-hidden="true">
        <rect x="0" y="0" width="160" height="96" rx="12" fill="#121826" />
        <rect x="10" y="10" width="140" height="76" rx="8" fill="#151b2e" />
        <line x1="18" y1="74" x2="142" y2="74" stroke="#2a3249" strokeWidth="1" />
        <line x1="18" y1="54" x2="142" y2="54" stroke="#222a3d" strokeWidth="1" />
        <line x1="18" y1="34" x2="142" y2="34" stroke="#222a3d" strokeWidth="1" />
        {focus ? (
          <rect
            x={focus.x}
            y="14"
            width={focus.width}
            height="62"
            rx="6"
            fill="rgba(99, 102, 241, 0.10)"
            stroke="rgba(99, 102, 241, 0.28)"
            strokeWidth="1"
          />
        ) : null}
        {extras}
        {candles.map((candle, index) => (
          <CandleGlyph key={`${candle.x}-${index}`} {...candle} />
        ))}
      </svg>
    </div>
  );
}

function renderCandlestickDiagram(patternId: string): DiagramSpec {
  switch (patternId) {
    case "hammer":
      return {
        candles: [
          { x: 24, open: 28, close: 44, high: 24, low: 50, color: "#ff5252" },
          { x: 44, open: 34, close: 52, high: 30, low: 58, color: "#ff5252" },
          { x: 64, open: 38, close: 60, high: 34, low: 66, color: "#ff5252" },
          { x: 86, open: 54, close: 48, high: 46, low: 76, color: "#00c853", width: 14 },
          { x: 110, open: 44, close: 28, high: 24, low: 48, color: "#00c853" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "inverted-hammer":
      return {
        candles: [
          { x: 24, open: 26, close: 42, high: 22, low: 48, color: "#ff5252" },
          { x: 44, open: 32, close: 50, high: 28, low: 56, color: "#ff5252" },
          { x: 64, open: 40, close: 58, high: 36, low: 64, color: "#ff5252" },
          { x: 86, open: 62, close: 56, high: 24, low: 66, color: "#00c853", width: 14 },
          { x: 110, open: 52, close: 36, high: 32, low: 58, color: "#00c853" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "bullish-marubozu":
      return {
        candles: [
          { x: 28, open: 58, close: 50, high: 46, low: 62, color: "#cbd5e1" },
          { x: 50, open: 54, close: 46, high: 42, low: 58, color: "#cbd5e1" },
          { x: 78, open: 72, close: 18, high: 18, low: 72, color: "#00c853", width: 16 },
          { x: 108, open: 44, close: 30, high: 26, low: 48, color: "#00c853" },
        ],
        focus: { x: 74, width: 24 },
      };
    case "dragonfly-doji":
      return {
        candles: [
          { x: 26, open: 28, close: 44, high: 24, low: 50, color: "#ff5252" },
          { x: 48, open: 34, close: 52, high: 30, low: 58, color: "#ff5252" },
          { x: 86, open: 30, close: 31, high: 29, low: 76, color: "#cbd5e1", width: 14 },
          { x: 110, open: 42, close: 26, high: 22, low: 46, color: "#00c853" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "hanging-man":
      return {
        candles: [
          { x: 24, open: 60, close: 46, high: 42, low: 64, color: "#00c853" },
          { x: 46, open: 54, close: 38, high: 34, low: 58, color: "#00c853" },
          { x: 68, open: 48, close: 30, high: 26, low: 52, color: "#00c853" },
          { x: 90, open: 28, close: 34, high: 26, low: 74, color: "#ff5252", width: 14 },
          { x: 114, open: 38, close: 52, high: 34, low: 58, color: "#ff5252" },
        ],
        focus: { x: 86, width: 22 },
      };
    case "shooting-star":
      return {
        candles: [
          { x: 24, open: 62, close: 48, high: 44, low: 66, color: "#00c853" },
          { x: 46, open: 56, close: 40, high: 36, low: 60, color: "#00c853" },
          { x: 68, open: 50, close: 34, high: 30, low: 54, color: "#00c853" },
          { x: 90, open: 54, close: 60, high: 18, low: 62, color: "#ff5252", width: 14 },
          { x: 114, open: 44, close: 58, high: 40, low: 62, color: "#ff5252" },
        ],
        focus: { x: 86, width: 22 },
      };
    case "bearish-marubozu":
      return {
        candles: [
          { x: 28, open: 40, close: 30, high: 26, low: 44, color: "#cbd5e1" },
          { x: 50, open: 36, close: 26, high: 22, low: 40, color: "#cbd5e1" },
          { x: 78, open: 18, close: 72, high: 18, low: 72, color: "#ff5252", width: 16 },
          { x: 108, open: 30, close: 44, high: 26, low: 48, color: "#ff5252" },
        ],
        focus: { x: 74, width: 24 },
      };
    case "gravestone-doji":
      return {
        candles: [
          { x: 26, open: 58, close: 42, high: 38, low: 62, color: "#00c853" },
          { x: 48, open: 52, close: 36, high: 32, low: 56, color: "#00c853" },
          { x: 86, open: 62, close: 63, high: 18, low: 64, color: "#cbd5e1", width: 14 },
          { x: 110, open: 40, close: 56, high: 36, low: 60, color: "#ff5252" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "doji":
      return {
        candles: [
          { x: 26, open: 48, close: 32, high: 28, low: 52, color: "#00c853" },
          { x: 48, open: 40, close: 24, high: 20, low: 44, color: "#00c853" },
          { x: 86, open: 38, close: 39, high: 20, low: 58, color: "#cbd5e1", width: 14 },
          { x: 110, open: 34, close: 48, high: 30, low: 52, color: "#ff5252" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "spinning-top":
      return {
        candles: [
          { x: 24, open: 44, close: 28, high: 22, low: 48, color: "#00c853" },
          { x: 48, open: 38, close: 22, high: 18, low: 42, color: "#00c853" },
          { x: 86, open: 34, close: 42, high: 14, low: 58, color: "#cbd5e1", width: 14 },
          { x: 110, open: 36, close: 50, high: 30, low: 54, color: "#ff5252" },
        ],
        focus: { x: 82, width: 22 },
      };
    case "bullish-engulfing":
      return {
        candles: [
          { x: 34, open: 24, close: 40, high: 20, low: 44, color: "#ff5252" },
          { x: 60, open: 46, close: 16, high: 14, low: 50, color: "#00c853" },
        ],
      };
    case "piercing-line":
      return {
        candles: [
          { x: 34, open: 18, close: 42, high: 16, low: 46, color: "#ff5252" },
          { x: 60, open: 50, close: 24, high: 48, low: 54, color: "#00c853" },
        ],
      };
    case "tweezer-bottom":
      return {
        candles: [
          { x: 34, open: 24, close: 42, high: 20, low: 52, color: "#ff5252" },
          { x: 60, open: 40, close: 20, high: 18, low: 52, color: "#00c853" },
        ],
      };
    case "bullish-harami":
      return {
        candles: [
          { x: 34, open: 18, close: 44, high: 14, low: 48, color: "#ff5252" },
          { x: 62, open: 36, close: 26, high: 24, low: 38, color: "#00c853" },
        ],
      };
    case "bearish-engulfing":
      return {
        candles: [
          { x: 34, open: 42, close: 20, high: 18, low: 46, color: "#00c853" },
          { x: 60, open: 16, close: 48, high: 14, low: 52, color: "#ff5252" },
        ],
      };
    case "dark-cloud-cover":
      return {
        candles: [
          { x: 34, open: 42, close: 16, high: 14, low: 46, color: "#00c853" },
          { x: 60, open: 12, close: 34, high: 10, low: 38, color: "#ff5252" },
        ],
      };
    case "tweezer-top":
      return {
        candles: [
          { x: 34, open: 42, close: 20, high: 18, low: 46, color: "#00c853" },
          { x: 60, open: 20, close: 40, high: 18, low: 44, color: "#ff5252" },
        ],
      };
    case "bearish-harami":
      return {
        candles: [
          { x: 34, open: 42, close: 16, high: 14, low: 46, color: "#00c853" },
          { x: 62, open: 24, close: 34, high: 22, low: 36, color: "#ff5252" },
        ],
      };
    case "morning-star":
    case "morning-doji-star":
      return {
        candles: [
          { x: 18, open: 16, close: 44, high: 14, low: 48, color: "#ff5252" },
          patternId === "morning-doji-star"
            ? { x: 48, open: 46, close: 47, high: 44, low: 50, color: "#cbd5e1" }
            : { x: 48, open: 42, close: 46, high: 40, low: 50, color: "#cbd5e1" },
          { x: 78, open: 44, close: 18, high: 16, low: 48, color: "#00c853" },
        ],
      };
    case "three-white-soldiers":
      return {
        candles: [
          { x: 18, open: 50, close: 30, high: 28, low: 54, color: "#00c853" },
          { x: 48, open: 42, close: 22, high: 20, low: 46, color: "#00c853" },
          { x: 78, open: 34, close: 14, high: 12, low: 38, color: "#00c853" },
        ],
      };
    case "three-inside-up":
      return {
        candles: [
          { x: 18, open: 18, close: 46, high: 14, low: 50, color: "#ff5252" },
          { x: 48, open: 40, close: 30, high: 28, low: 42, color: "#00c853" },
          { x: 78, open: 34, close: 14, high: 12, low: 38, color: "#00c853" },
        ],
      };
    case "evening-star":
    case "evening-doji-star":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#00c853" },
          patternId === "evening-doji-star"
            ? { x: 48, open: 16, close: 17, high: 14, low: 20, color: "#cbd5e1" }
            : { x: 48, open: 18, close: 22, high: 16, low: 26, color: "#cbd5e1" },
          { x: 78, open: 20, close: 46, high: 18, low: 50, color: "#ff5252" },
        ],
      };
    case "three-black-crows":
      return {
        candles: [
          { x: 18, open: 20, close: 40, high: 18, low: 44, color: "#ff5252" },
          { x: 48, open: 28, close: 48, high: 26, low: 52, color: "#ff5252" },
          { x: 78, open: 36, close: 56, high: 34, low: 60, color: "#ff5252" },
        ],
      };
    case "three-inside-down":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#00c853" },
          { x: 48, open: 24, close: 34, high: 22, low: 36, color: "#ff5252" },
          { x: 78, open: 30, close: 52, high: 28, low: 56, color: "#ff5252" },
        ],
      };
    case "abandoned-baby-bullish":
      return {
        candles: [
          { x: 18, open: 18, close: 44, high: 16, low: 48, color: "#ff5252" },
          { x: 50, open: 52, close: 53, high: 50, low: 56, color: "#cbd5e1" },
          { x: 82, open: 42, close: 16, high: 14, low: 46, color: "#00c853" },
        ],
      };
    case "abandoned-baby-bearish":
      return {
        candles: [
          { x: 18, open: 46, close: 18, high: 16, low: 50, color: "#00c853" },
          { x: 50, open: 10, close: 11, high: 8, low: 14, color: "#cbd5e1" },
          { x: 82, open: 20, close: 46, high: 18, low: 50, color: "#ff5252" },
        ],
      };
    default:
      return {
        candles: [
          { x: 24, open: 44, close: 24, high: 20, low: 50, color: "#00c853" },
          { x: 54, open: 24, close: 44, high: 20, low: 50, color: "#ff5252" },
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
