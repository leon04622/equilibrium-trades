import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertCircle, Target, ShieldCheck } from "lucide-react";
import type { LivePattern } from "@shared/schema";

interface ChartPatternOverlayProps {
  patterns: LivePattern[];
  currentPrice: number;
  chartHeight: number;
}

export function ChartPatternOverlay({ patterns, currentPrice }: ChartPatternOverlayProps) {
  if (patterns.length === 0) return null;

  const formatPrice = (p: number) => {
    if (!p || isNaN(p)) return "---";
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(6);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Pattern indicators in top-left */}
      <div className="absolute top-4 left-4 space-y-2">
        {patterns.slice(0, 2).map((pattern) => (
          <Card
            key={pattern.id}
            className="pointer-events-auto bg-background/90 backdrop-blur-sm"
          >
            <div className="p-2 flex items-center gap-2">
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
          </Card>
        ))}
      </div>

      {/* Trade levels info in top-right */}
      {patterns.length > 0 && patterns[0] && (
        <div className="absolute top-4 right-4 space-y-1">
          {patterns[0].takeProfit && (
            <div className="flex items-center gap-1 bg-bullish/20 px-2 py-1 rounded text-[10px] text-bullish pointer-events-auto">
              <Target className="h-3 w-3" />
              <span>TP: {formatPrice(patterns[0].takeProfit)}</span>
            </div>
          )}
          {patterns[0].entryPrice && (
            <div className="flex items-center gap-1 bg-primary/20 px-2 py-1 rounded text-[10px] text-primary pointer-events-auto">
              <span>Entry: {formatPrice(patterns[0].entryPrice)}</span>
            </div>
          )}
          {patterns[0].stopLoss && (
            <div className="flex items-center gap-1 bg-bearish/20 px-2 py-1 rounded text-[10px] text-bearish pointer-events-auto">
              <ShieldCheck className="h-3 w-3" />
              <span>SL: {formatPrice(patterns[0].stopLoss)}</span>
            </div>
          )}
        </div>
      )}

      {/* Legend at bottom */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 text-[10px] text-muted-foreground pointer-events-auto bg-background/80 px-2 py-1 rounded">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-bullish" />
          <span>Take Profit</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-bearish" />
          <span>Stop Loss</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary" />
          <span>Entry</span>
        </div>
      </div>
    </div>
  );
}
