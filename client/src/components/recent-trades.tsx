import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentTradesProps {
  coin: string;
}

interface Trade {
  coin: string;
  side: "A" | "B";
  px: string;
  sz: string;
  time: number;
}

export function RecentTrades({ coin }: RecentTradesProps) {
  const { data: rawTrades, isLoading } = useQuery<Trade[]>({
    queryKey: [`/api/hyperliquid/trades/${coin}`],
    refetchInterval: 3000,
  });
  
  // Safely handle non-array responses
  const trades = Array.isArray(rawTrades) ? rawTrades : [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { 
      hour12: false, 
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit" 
    });
  };

  return (
    <div className="h-full flex flex-col text-xs font-mono">
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b text-muted-foreground text-[10px] uppercase tracking-wider">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {trades.slice(0, 50).map((trade, i) => {
          const isBuy = trade.side === "B";
          return (
            <div
              key={`trade-${i}-${trade.time}`}
              className="grid grid-cols-3 gap-2 px-3 py-1 hover-elevate"
              data-testid={`recent-trade-${i}`}
            >
              <span className={isBuy ? "text-bullish" : "text-bearish"}>
                {parseFloat(trade.px).toFixed(2)}
              </span>
              <span className="text-right">{parseFloat(trade.sz).toFixed(4)}</span>
              <span className="text-right text-muted-foreground">
                {formatTime(trade.time)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
