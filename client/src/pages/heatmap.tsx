import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Lock, TrendingUp, TrendingDown, Info, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiquidityHeatmap } from "@/components/liquidity-heatmap";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SubscriptionGuard } from "@/components/SubscriptionGuard";

interface Ticker {
  coin: string;
  markPx: string;
  prevDayPx: string;
}

function HeatmapContent() {
  const [selectedCoin, setSelectedCoin] = useState("BTC");

  // Fetch available coins
  const { data: tickers = [] } = useQuery<Ticker[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 10000,
  });

  const currentTicker = tickers.find((t) => t.coin === selectedCoin);
  const price = currentTicker ? parseFloat(currentTicker.markPx) : 0;
  const prevPrice = currentTicker ? parseFloat(currentTicker.prevDayPx) : price;
  const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Flame className="h-6 w-6 text-warning" />
          <div>
            <h1 className="text-lg font-display font-bold flex items-center gap-2">
              Liquidity Heatmap
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                Bookmap Style
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Real-time order flow visualization for all assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Coin Selector */}
          <Select value={selectedCoin} onValueChange={setSelectedCoin}>
            <SelectTrigger className="w-40" data-testid="select-heatmap-coin">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tickers.slice(0, 20).map((ticker) => (
                <SelectItem key={ticker.coin} value={ticker.coin}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{ticker.coin}</span>
                    <span className="text-muted-foreground text-xs">/USDC</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Current Price Display */}
          {price > 0 && (
            <div className="text-right">
              <p className="font-mono font-semibold">${formatPrice(price)}</p>
              <p className={cn(
                "text-xs font-mono",
                change >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Heatmap Area */}
        <div className="flex-1 min-h-0">
          <LiquidityHeatmap 
            coin={selectedCoin} 
            locked={false}
            className="h-full"
          />
        </div>

        {/* Info Sidebar — collapsed on smaller screens so the chart matches Bookmap width */}
        <div className="w-56 border-l p-3 space-y-3 overflow-y-auto hidden xl:block shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">How to Read</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <div className="h-3 w-10 rounded-sm shrink-0 mt-0.5 bg-gradient-to-r from-[#0a1628] via-[#22d3ee] to-[#dc2626]" />
                <div>
                  <p className="font-medium">Heatmap colors</p>
                  <p className="text-muted-foreground">Blue = thin book; yellow/red = heavy resting liquidity</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-4 w-4 rounded-full bg-green-500/50 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Green bubbles</p>
                  <p className="text-muted-foreground">Buy trades (size = circle area)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-4 w-4 rounded-full bg-red-500/50 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Red bubbles</p>
                  <p className="text-muted-foreground">Sell trades through the book</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-4 w-4 border border-dashed border-white/60 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">White dashed line</p>
                  <p className="text-muted-foreground">Current price (red tag on the right)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-4 w-6 rounded-sm bg-green-500/40 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">SVP column</p>
                  <p className="text-muted-foreground">Session volume at each price (green buy / red sell)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Trading Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2 text-xs">
                <TrendingUp className="h-4 w-4 text-bullish mt-0.5" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Support:</strong> Large green walls often prevent price from falling
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <TrendingDown className="h-4 w-4 text-bearish mt-0.5" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Resistance:</strong> Large red walls often cap upward moves
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Info className="h-4 w-4 text-primary mt-0.5" />
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Whale Activity:</strong> Sudden large orders marked with circles may indicate institutional moves
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-2">Strategy Tip</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When 21 SMA crosses above 200 SMA and you see a large green wall below current price, 
                this creates a strong support zone for entry. Set your stop loss just below the wall.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Heatmap() {
  return (
    <SubscriptionGuard>
      <HeatmapContent />
    </SubscriptionGuard>
  );
}
