import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadCandlestickPatternImageUrl } from "@/lib/candlestick-pattern-images";
import { cn } from "@/lib/utils";

type CandlestickPatternImageProps = {
  imageFile: string;
  alt: string;
  patternName?: string;
  className?: string;
  imgClassName?: string;
};

export function CandlestickPatternImage({
  imageFile,
  alt,
  patternName,
  className,
  imgClassName,
}: CandlestickPatternImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const fallbackTone = useMemo(() => {
    const raw = `${patternName ?? ""} ${imageFile}`.toLowerCase();
    if (
      raw.includes("bull") ||
      raw.includes("hammer") ||
      raw.includes("morning") ||
      raw.includes("dragonfly") ||
      raw.includes("piercing") ||
      raw.includes("white soldiers")
    ) {
      return "bullish";
    }
    if (
      raw.includes("bear") ||
      raw.includes("shooting") ||
      raw.includes("evening") ||
      raw.includes("gravestone") ||
      raw.includes("dark cloud") ||
      raw.includes("black crows")
    ) {
      return "bearish";
    }
    return "neutral";
  }, [imageFile, patternName]);

  const fallbackCandles = useMemo(() => {
    if (fallbackTone === "bullish") {
      return [
        { x: 22, bodyTop: 62, bodyBottom: 108, wickTop: 36, wickBottom: 132, color: "#26a69a" },
        { x: 58, bodyTop: 72, bodyBottom: 102, wickTop: 56, wickBottom: 126, color: "#26a69a" },
        { x: 94, bodyTop: 40, bodyBottom: 98, wickTop: 18, wickBottom: 122, color: "#26a69a" },
      ];
    }
    if (fallbackTone === "bearish") {
      return [
        { x: 22, bodyTop: 44, bodyBottom: 96, wickTop: 20, wickBottom: 122, color: "#ef5350" },
        { x: 58, bodyTop: 58, bodyBottom: 104, wickTop: 36, wickBottom: 130, color: "#ef5350" },
        { x: 94, bodyTop: 72, bodyBottom: 118, wickTop: 50, wickBottom: 142, color: "#ef5350" },
      ];
    }
    return [
      { x: 22, bodyTop: 58, bodyBottom: 92, wickTop: 30, wickBottom: 122, color: "#94a3b8" },
      { x: 58, bodyTop: 64, bodyBottom: 88, wickTop: 24, wickBottom: 128, color: "#94a3b8" },
      { x: 94, bodyTop: 60, bodyBottom: 90, wickTop: 28, wickBottom: 120, color: "#94a3b8" },
    ];
  }, [fallbackTone]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    loadCandlestickPatternImageUrl(imageFile).then((url) => {
      if (cancelled) return;
      if (url) setSrc(url);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [imageFile]);

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-muted/30", className)}>
      {!src && !failed ? (
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      ) : null}
      {failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-3 py-4 text-center">
          <svg
            viewBox="0 0 120 160"
            className="h-full max-h-40 w-full max-w-[220px]"
            aria-hidden="true"
          >
            <rect x="0" y="0" width="120" height="160" rx="16" fill="currentColor" className="text-background" />
            {fallbackCandles.map((candle, index) => (
              <g key={`${candle.x}-${index}`}>
                <line
                  x1={candle.x + 8}
                  x2={candle.x + 8}
                  y1={candle.wickTop}
                  y2={candle.wickBottom}
                  stroke={candle.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <rect
                  x={candle.x}
                  y={candle.bodyTop}
                  width="16"
                  height={Math.max(10, candle.bodyBottom - candle.bodyTop)}
                  rx="3"
                  fill={candle.color}
                />
              </g>
            ))}
          </svg>
          <span className="text-xs text-muted-foreground">
            {patternName ? `${patternName} diagram preview` : "Pattern diagram preview"}
          </span>
        </div>
      ) : null}
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn("h-full w-full object-contain", imgClassName)}
        />
      ) : null}
    </div>
  );
}
