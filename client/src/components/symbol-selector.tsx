import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Ticker {
  coin: string;
  markPx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm?: string;
}

interface SymbolSelectorProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

export function SymbolSelector({ currentSymbol, onSymbolChange }: SymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tickers = [], isLoading } = useQuery<Ticker[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 5000,
  });

  const currentTicker = tickers.find(t => t.coin === currentSymbol);
  const price = currentTicker ? parseFloat(currentTicker.markPx) : 0;
  const prevPrice = currentTicker ? parseFloat(currentTicker.prevDayPx) : price;
  const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

  const filteredTickers = tickers
    .filter(t => t.coin.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const volA = parseFloat(a.dayNtlVlm || "0");
      const volB = parseFloat(b.dayNtlVlm || "0");
      return volB - volA;
    });

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          className="h-auto py-1 px-2 gap-2 font-mono hover-elevate"
          data-testid="button-symbol-selector"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <span className="text-xs font-bold text-primary">
              {currentSymbol?.slice(0, 1) || "B"}
            </span>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">{currentSymbol || "BTC"}-USDC</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{formatPrice(price)}</span>
                <span className={cn(
                  "text-xs",
                  change >= 0 ? "text-bullish" : "text-bearish"
                )}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search markets..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-symbol-search"
            />
          </div>
        </div>
        <ScrollArea className="h-80">
          <div className="p-2">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              filteredTickers.map((ticker) => {
                const tickerPrice = parseFloat(ticker.markPx);
                const tickerPrevPrice = parseFloat(ticker.prevDayPx) || tickerPrice;
                const tickerChange = tickerPrevPrice > 0 
                  ? ((tickerPrice - tickerPrevPrice) / tickerPrevPrice) * 100 
                  : 0;

                return (
                  <button
                    key={ticker.coin}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-md hover-elevate transition-colors",
                      currentSymbol === ticker.coin && "bg-accent"
                    )}
                    onClick={() => {
                      onSymbolChange(ticker.coin);
                      setOpen(false);
                    }}
                    data-testid={`symbol-${ticker.coin}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {ticker.coin.slice(0, 2)}
                      </div>
                      <div className="text-left">
                        <p className="font-mono font-medium text-sm">{ticker.coin}/USDC</p>
                        <p className="text-xs text-muted-foreground">Perpetual</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm">${formatPrice(tickerPrice)}</p>
                      <div className={cn(
                        "flex items-center justify-end gap-0.5 text-xs",
                        tickerChange >= 0 ? "text-bullish" : "text-bearish"
                      )}>
                        {tickerChange >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{tickerChange >= 0 ? "+" : ""}{tickerChange.toFixed(2)}%</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
