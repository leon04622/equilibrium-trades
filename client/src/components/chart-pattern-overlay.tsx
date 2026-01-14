import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertCircle, Target, ShieldCheck } from "lucide-react";
import type { LivePattern } from "@shared/schema";

interface ChartPatternOverlayProps {
  patterns: LivePattern[];
  currentPrice: number;
  chartHeight: number;
}

export function ChartPatternOverlay({ patterns, currentPrice }: ChartPatternOverlayProps) {
  // Don't render any overlay - patterns shown in separate panel instead
  return null;

  const formatPrice = (p: number) => {
    if (!p || isNaN(p)) return "---";
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(6);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Pattern indicators and trade levels in bottom-right corner */}
      <div className="absolute bottom-12 right-4 space-y-2 pointer-events-auto">
        {patterns.slice(0, 2).map((pattern) => (
          <div
            key={pattern.id}
            className="bg-background/90 backdrop-blur-sm border rounded-md p-2 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  pattern.pattern.direction === "bullish"
                    ? "bg-bullish/15 text-bullish border-bullish/30"
                    : pattern.pattern.direction === "bearish"
                    ? "bg-bearish/15 text-bearish border-bearish/30"
                    : "bg-muted"
                )}
              >
                {pattern.pattern.direction === "bullish" ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : pattern.pattern.direction === "bearish" ? (
                  <TrendingDown className="h-3 w-3 mr-1" />
                ) : (
                  <AlertCircle className="h-3 w-3 mr-1" />
                )}
                {pattern.pattern.name}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {pattern.confidence}%
              </span>
            </div>
            
            {/* Trade levels inline */}
            <div className="flex items-center gap-2 mt-1 text-[9px]">
              {pattern.entryPrice && (
                <span className="text-primary">E: {formatPrice(pattern.entryPrice)}</span>
              )}
              {pattern.takeProfit && (
                <span className="text-bullish flex items-center gap-0.5">
                  <Target className="h-2.5 w-2.5" />
                  {formatPrice(pattern.takeProfit)}
                </span>
              )}
              {pattern.stopLoss && (
                <span className="text-bearish flex items-center gap-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {formatPrice(pattern.stopLoss)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
