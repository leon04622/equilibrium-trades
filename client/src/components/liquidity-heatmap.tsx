import { Lock, Flame, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface LiquidityLevel {
  price: number;
  volume: number;
  type: "bid" | "ask";
}

interface LiquidityHeatmapProps {
  currentPrice: number;
  levels?: LiquidityLevel[];
  locked?: boolean;
}

export function LiquidityHeatmap({ 
  currentPrice, 
  levels = [],
  locked = true 
}: LiquidityHeatmapProps) {
  // Generate demo levels if none provided
  const demoLevels: LiquidityLevel[] = levels.length > 0 ? levels : Array.from({ length: 20 }, (_, i) => {
    const priceOffset = (i - 10) * 50;
    const price = currentPrice + priceOffset;
    const volume = Math.random() * 100;
    return {
      price,
      volume,
      type: priceOffset > 0 ? "ask" : "bid",
    };
  }).reverse();

  const maxVolume = Math.max(...demoLevels.map(l => l.volume));

  const getHeatColor = (volume: number, type: "bid" | "ask") => {
    const intensity = volume / maxVolume;
    if (type === "bid") {
      if (intensity > 0.7) return "bg-bullish/80";
      if (intensity > 0.4) return "bg-bullish/50";
      return "bg-bullish/25";
    } else {
      if (intensity > 0.7) return "bg-bearish/80";
      if (intensity > 0.4) return "bg-bearish/50";
      return "bg-bearish/25";
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="liquidity-heatmap">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Flame className="h-4 w-4 text-warning" />
            Liquidity Heatmap
          </CardTitle>
          {locked && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Pro Feature
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="relative">
        {locked && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">Unlock Liquidity Heatmap</p>
            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[200px]">
              See where large orders are sitting and identify key support/resistance levels
            </p>
            <Link href="/pricing">
              <Button size="sm" data-testid="button-upgrade-heatmap">
                Upgrade to Pro
              </Button>
            </Link>
          </div>
        )}

        <div className={cn("space-y-0.5", locked && "blur-sm pointer-events-none")}>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-bullish" />
              Bids
            </span>
            <span className="font-mono">${currentPrice.toLocaleString()}</span>
            <span className="flex items-center gap-1">
              Asks
              <TrendingDown className="h-3 w-3 text-bearish" />
            </span>
          </div>

          {demoLevels.map((level, index) => {
            const isCurrentPrice = Math.abs(level.price - currentPrice) < 25;
            const barWidth = (level.volume / maxVolume) * 100;
            
            return (
              <div 
                key={index}
                className={cn(
                  "flex items-center h-5 rounded-sm overflow-hidden",
                  isCurrentPrice && "ring-1 ring-primary"
                )}
              >
                <div 
                  className="h-full flex items-center justify-end pr-2"
                  style={{ width: '40%' }}
                >
                  {level.type === "bid" && (
                    <div 
                      className={cn(
                        "h-full flex items-center justify-end pr-1 rounded-l-sm",
                        getHeatColor(level.volume, level.type)
                      )}
                      style={{ width: `${barWidth}%`, minWidth: '4px' }}
                    >
                      <span className="text-[9px] font-mono text-bullish-foreground/80">
                        {level.volume.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className={cn(
                  "w-[20%] text-center text-[10px] font-mono",
                  isCurrentPrice ? "font-bold text-primary" : "text-muted-foreground"
                )}>
                  ${level.price.toLocaleString()}
                </div>
                <div 
                  className="h-full flex items-center pl-2"
                  style={{ width: '40%' }}
                >
                  {level.type === "ask" && (
                    <div 
                      className={cn(
                        "h-full flex items-center pl-1 rounded-r-sm",
                        getHeatColor(level.volume, level.type)
                      )}
                      style={{ width: `${barWidth}%`, minWidth: '4px' }}
                    >
                      <span className="text-[9px] font-mono text-bearish-foreground/80">
                        {level.volume.toFixed(0)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!locked && (
          <div className="mt-4 p-3 rounded-md bg-muted/50">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">How to read:</strong> Brighter colors indicate larger order clusters. 
              These often act as support (green) or resistance (red) levels.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
