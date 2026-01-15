import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrading } from "@/lib/trading-context";

interface Trade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  value: number;
  timestamp: Date;
  pnl?: number;
  status: "filled" | "partial" | "pending";
}

interface TradeHistoryProps {
  coin: string;
  className?: string;
}

export function TradeHistory({ coin, className }: TradeHistoryProps) {
  const { tradeHistory } = useTrading();
  
  // Convert trading context history to display format
  const trades: Trade[] = tradeHistory.map(t => ({
    id: t.id,
    symbol: t.coin,
    side: t.side,
    price: t.price,
    size: t.size,
    value: t.size * t.price,
    timestamp: t.timestamp,
    pnl: t.pnl,
    status: "filled" as const,
  }));
  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}h ago`;
    } else {
      return `${Math.floor(diff / 86400000)}d ago`;
    }
  };

  // Filter trades by coin
  const filteredTrades = trades.filter(t => t.symbol === coin || !coin);

  const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  return (
    <Card className={cn("", className)} data-testid="trade-history">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4" />
            Trade History
          </CardTitle>
          <Badge 
            variant={totalPnL >= 0 ? "default" : "destructive"}
            className="text-xs"
          >
            {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-0 pb-0">
        <ScrollArea className="h-[300px]">
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No trades yet</p>
              <p className="text-xs">Your trade history will appear here</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="px-4 py-3 hover:bg-muted/50 transition-colors"
                  data-testid={`trade-${trade.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5",
                          trade.side === "buy"
                            ? "bg-bullish/15 text-bullish border-bullish/30"
                            : "bg-bearish/15 text-bearish border-bearish/30"
                        )}
                      >
                        {trade.side === "buy" ? (
                          <TrendingUp className="h-3 w-3 mr-1" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-1" />
                        )}
                        {trade.side.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-semibold">{trade.symbol}</span>
                    </div>
                    {trade.pnl !== undefined && (
                      <span className={cn(
                        "text-sm font-medium",
                        trade.pnl >= 0 ? "text-bullish" : "text-bearish"
                      )}>
                        {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span>{trade.size} @ ${formatPrice(trade.price)}</span>
                      <span className="text-muted-foreground/60">
                        ${formatPrice(trade.value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatTime(trade.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
