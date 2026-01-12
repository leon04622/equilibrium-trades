import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketCondition } from "@shared/schema";

interface SMAIndicatorProps {
  marketCondition: MarketCondition;
}

export function SMAIndicator({ marketCondition }: SMAIndicatorProps) {
  const {
    symbol,
    currentPrice,
    sma21_1m,
    sma200_1m,
    sma200_5m,
    trend,
    crossoverActive,
    above5mSma200,
  } = marketCondition;

  const priceVsSma21 = currentPrice > sma21_1m;
  const priceVsSma200 = currentPrice > sma200_1m;
  const sma21VsSma200 = sma21_1m > sma200_1m;

  return (
    <Card data-testid="sma-indicator">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display">SMA Analysis</CardTitle>
          <Badge 
            variant={trend === "bullish" ? "default" : trend === "bearish" ? "destructive" : "secondary"}
            className={cn(
              "capitalize",
              trend === "bullish" && "bg-bullish text-bullish-foreground hover:bg-bullish/90"
            )}
          >
            {trend === "bullish" && <TrendingUp className="h-3 w-3 mr-1" />}
            {trend === "bearish" && <TrendingDown className="h-3 w-3 mr-1" />}
            {trend === "neutral" && <Minus className="h-3 w-3 mr-1" />}
            {trend}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">21 SMA (1m)</p>
            <p className="font-mono font-semibold text-sm">
              ${sma21_1m.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {priceVsSma21 ? (
                <>
                  <ArrowUp className="h-3 w-3 text-bullish" />
                  <span className="text-[10px] text-bullish">Price Above</span>
                </>
              ) : (
                <>
                  <ArrowDown className="h-3 w-3 text-bearish" />
                  <span className="text-[10px] text-bearish">Price Below</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">200 SMA (1m)</p>
            <p className="font-mono font-semibold text-sm">
              ${sma200_1m.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {priceVsSma200 ? (
                <>
                  <ArrowUp className="h-3 w-3 text-bullish" />
                  <span className="text-[10px] text-bullish">Price Above</span>
                </>
              ) : (
                <>
                  <ArrowDown className="h-3 w-3 text-bearish" />
                  <span className="text-[10px] text-bearish">Price Below</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground mb-1">200 SMA (5m)</p>
          <div className="flex items-center justify-between">
            <p className="font-mono font-semibold text-sm">
              ${sma200_5m.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            <Badge 
              variant={above5mSma200 ? "default" : "secondary"}
              className={cn(
                "text-[10px]",
                above5mSma200 && "bg-bullish text-bullish-foreground hover:bg-bullish/90"
              )}
            >
              {above5mSma200 ? "Above" : "Below"}
            </Badge>
          </div>
        </div>

        <div className={cn(
          "rounded-md p-3 border",
          crossoverActive 
            ? "bg-primary/10 border-primary/30" 
            : "bg-muted/30 border-transparent"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium">21/200 Crossover</p>
              <p className="text-[10px] text-muted-foreground">
                {sma21VsSma200 ? "21 SMA above 200 SMA" : "21 SMA below 200 SMA"}
              </p>
            </div>
            {crossoverActive ? (
              <Badge className="bg-primary text-primary-foreground animate-pulse">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </div>

        <div className="rounded-md bg-accent/50 p-3">
          <p className="text-xs font-medium mb-1">Strategy Status</p>
          <p className="text-xs text-muted-foreground">
            {crossoverActive && above5mSma200 && sma21VsSma200 && (
              "Bullish setup active - look for bull flags, triangles, and continuation patterns."
            )}
            {crossoverActive && !above5mSma200 && !sma21VsSma200 && (
              "Bearish setup active - look for bear flags and short opportunities."
            )}
            {!crossoverActive && (
              "Waiting for 21/200 SMA crossover on 1-minute timeframe."
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
