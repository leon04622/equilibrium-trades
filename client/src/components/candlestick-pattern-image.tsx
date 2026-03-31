import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadCandlestickPatternImageUrl } from "@/lib/candlestick-pattern-images";
import { cn } from "@/lib/utils";

type CandlestickPatternImageProps = {
  imageFile: string;
  alt: string;
  className?: string;
  imgClassName?: string;
};

export function CandlestickPatternImage({
  imageFile,
  alt,
  className,
  imgClassName,
}: CandlestickPatternImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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
        <span className="px-3 text-center text-xs text-muted-foreground">Diagram unavailable</span>
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
