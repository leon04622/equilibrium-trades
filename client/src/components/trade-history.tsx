import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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

const mockTrades: Trade[] = [
  {
    id: "1",
    symbol: "BTC",
    side: "buy",
    price: 102450,
    size: 0.05,
    value: 5122.50,
    timestamp: new Date(Date.now() - 3600000),
    pnl: 125.50,
    status: "filled",
  },
  {
    id: "2",
    symbol: "BTC",
    side: "sell",
    price: 103200,
    size: 0.025,
    value: 2580,
    timestamp: new Date(Date.now() - 7200000),
    pnl: 62.75,
    status: "filled",
  },
  {
    id: "3",
    symbol: "ETH",
    side: "buy",
    price: 3850,
    size: 1.5,
    value: 5775,
    timestamp: new Date(Date.now() - 14400000),
    pnl: -45.20,
    status: "filled",
  },
  {
    id: "4",
    symbol: "SOL",
    side: "buy",
    price: 210,
    size: 25,
    value: 5250,
    timestamp: new Date(Date.now() - 86400000),
    pnl: 312.50,
    status: "filled",
  },
  {
    id: "5",
    symbol: "BTC",
    side: "sell",
    price: 101800,
    size: 0.1,
    value: 10180,
    timestamp: new Date(Date.now() - 172800000),
    pnl: -89.00,
    status: "filled",
  },
];

export function TradeHistory({ coin, className }: TradeHistoryProps) {
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
  const filteredTrades = mockTrades.filter(t => t.symbol === coin || !coin);

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
