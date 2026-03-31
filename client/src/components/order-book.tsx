import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OrderBookProps {
  coin: string;
}

interface OrderLevel {
  px: string;
  sz: string;
  n: number;
}

interface OrderBookData {
  levels: [OrderLevel[], OrderLevel[]];
}

export function OrderBook({ coin }: OrderBookProps) {
  const { data: orderBook, isLoading } = useQuery<OrderBookData>({
    queryKey: [`/api/hyperliquid/orderbook/${coin}`],
    refetchInterval: 3000,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  // Safely access levels with fallback to empty arrays
  const rawBids = Array.isArray(orderBook?.levels?.[0]) ? orderBook.levels[0] : [];
  const rawAsks = Array.isArray(orderBook?.levels?.[1]) ? orderBook.levels[1] : [];
  const bids = rawBids.slice(0, 10);
  const asks = rawAsks.slice(0, 10).reverse();

  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.sz) || 0), 1);
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.sz) || 0), 1);
  const bestBid = bids[0]?.px ? parseFloat(bids[0].px) : NaN;
  const bestAsk = asks[asks.length - 1]?.px ? parseFloat(asks[asks.length - 1].px) : NaN;
  const spread = Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? Math.max(bestAsk - bestBid, 0) : NaN;

  return (
    <div className="h-full flex flex-col text-xs font-mono">
      <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold text-foreground">Order Book</p>
          <p className="text-[10px] text-muted-foreground">Live depth around the current market</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
          <ArrowDownUp className="h-3 w-3" />
          {Number.isFinite(spread) ? `Spread ${spread.toFixed(2)}` : "Live"}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b text-muted-foreground text-[10px] uppercase tracking-wider">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {asks.map((ask, i) => {
            const size = parseFloat(ask.sz) || 0;
            const width = (size / maxAskSize) * 100;
            return (
              <div key={`ask-${i}`} className="grid grid-cols-3 gap-2 px-3 py-1 relative hover:bg-bearish/5" data-testid={`orderbook-ask-${i}`}>
                <div
                  className="absolute inset-0 bg-bearish/10"
                  style={{ width: `${width}%`, right: 0, left: "auto" }}
                />
                <span className="relative text-bearish">{parseFloat(ask.px).toFixed(2)}</span>
                <span className="relative text-right">{size.toFixed(4)}</span>
                <span className="relative text-right text-muted-foreground">
                  {(size * parseFloat(ask.px)).toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-y bg-muted/30 px-3 py-2">
          <span className="text-base font-bold text-bullish">
            {bids[0]?.px ? parseFloat(bids[0].px).toFixed(2) : "---"}
          </span>
          <span className="text-muted-foreground text-[10px]">Spread</span>
          <span className="text-base font-bold text-bearish">
            {asks[asks.length - 1]?.px ? parseFloat(asks[asks.length - 1].px).toFixed(2) : "---"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {bids.map((bid, i) => {
            const size = parseFloat(bid.sz) || 0;
            const width = (size / maxBidSize) * 100;
            return (
              <div key={`bid-${i}`} className="grid grid-cols-3 gap-2 px-3 py-1 relative hover:bg-bullish/5" data-testid={`orderbook-bid-${i}`}>
                <div
                  className="absolute inset-0 bg-bullish/10"
                  style={{ width: `${width}%`, right: 0, left: "auto" }}
                />
                <span className="relative text-bullish">{parseFloat(bid.px).toFixed(2)}</span>
                <span className="relative text-right">{size.toFixed(4)}</span>
                <span className="relative text-right text-muted-foreground">
                  {(size * parseFloat(bid.px)).toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
