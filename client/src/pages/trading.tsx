import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradingViewChart } from "@/components/trading-view-chart";
import { PatternChart } from "@/components/pattern-chart";
import { SymbolSelector } from "@/components/symbol-selector";
import { OrderBook } from "@/components/order-book";
import { RecentTrades } from "@/components/recent-trades";
import { OrderEntry } from "@/components/order-entry";
import { AccountEquity } from "@/components/account-equity";
import { BottomTradingPanel } from "@/components/bottom-trading-panel";
import { ChartPositionOverlay } from "@/components/chart-position-overlay";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Settings, BookOpen, Brain } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import type { MarketCondition } from "@shared/schema";
import { cn } from "@/lib/utils";

const timeframes = [
  { value: "1", label: "1m" },
  { value: "3", label: "3m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1D" },
];

interface TradingProps {
  visible?: boolean;
}

export default function Trading({ visible = true }: TradingProps) {
  const [coin, setCoin] = useState("BTC");
  const [timeframe, setTimeframe] = useState("5");
  const [showOrderBook, setShowOrderBook] = useState(false);
  const [orderBookMode, setOrderBookMode] = useState<"book" | "trades">("book");
  const [showAIChart, setShowAIChart] = useState(false);
  const { toast } = useToast();
  const { updatePrices } = useTrading();

  const tvSymbol = `BINANCE:${coin}USDT`;

  const handleOrderSubmit = (order: any) => {
    toast({
      title: `${order.side === "buy" ? "Long" : "Short"} Order Submitted`,
      description: `${order.quantity} ${coin} at $${order.price?.toLocaleString() || "market"}`,
    });
  };

  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: visible ? 3000 : false,
    enabled: visible,
  });

  const currentTicker = tickers.find((t) => t.coin === coin);
  const price = currentTicker ? parseFloat(currentTicker.markPx) : 0;
  const prevPrice = currentTicker ? parseFloat(currentTicker.prevDayPx) : price;
  const priceChange = prevPrice > 0 ? price - prevPrice : 0;
  const priceChangePercent = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
  const volume24h = currentTicker ? parseFloat(currentTicker.dayNtlVlm) : 0;
  const openInterest = currentTicker ? parseFloat(currentTicker.openInterest || "0") : 0;
  const fundingRate = currentTicker ? parseFloat(currentTicker.funding || "0") : 0;

  useEffect(() => {
    if (tickers.length > 0) {
      const prices: Record<string, number> = {};
      tickers.forEach((t: any) => {
        if (t.coin && t.markPx) {
          prices[t.coin] = parseFloat(t.markPx);
        }
      });
      updatePrices(prices);
    }
  }, [tickers, updatePrices]);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const formatVolume = (v: number) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Header - Symbol info bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b bg-card/50">
        <SymbolSelector currentSymbol={coin} onSymbolChange={setCoin} />
        
        <Separator orientation="vertical" className="h-6" />
        
        {/* Price and stats */}
        <div className="flex items-center gap-6 text-xs overflow-x-auto flex-1">
          <div>
            <span className="text-muted-foreground">Mark</span>
            <p className={cn(
              "font-mono font-bold text-base",
              priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {formatPrice(price)}
            </p>
          </div>
          
          <div>
            <span className="text-muted-foreground">24h Change</span>
            <p className={cn(
              "font-mono font-semibold",
              priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {priceChange >= 0 ? "+" : ""}{formatPrice(priceChange)} ({priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%)
            </p>
          </div>
          
          <div className="hidden md:block">
            <span className="text-muted-foreground">24h Volume</span>
            <p className="font-mono">{formatVolume(volume24h)}</p>
          </div>
          
          <div className="hidden lg:block">
            <span className="text-muted-foreground">Open Interest</span>
            <p className="font-mono">{formatVolume(openInterest)}</p>
          </div>
          
          <div className="hidden lg:block">
            <span className="text-muted-foreground">Funding</span>
            <p className={cn(
              "font-mono",
              fundingRate >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {(fundingRate * 100).toFixed(4)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main trading area */}
      <div className="flex-1 flex min-h-0">
        {/* Left side - Chart */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chart toolbar */}
          <div className="flex items-center justify-between px-2 py-1 border-b gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {timeframes.map((tf) => (
                <Button
                  key={tf.value}
                  variant={timeframe === tf.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs font-mono shrink-0"
                  onClick={() => setTimeframe(tf.value)}
                  data-testid={`timeframe-${tf.value}`}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Switch 
                  checked={showAIChart} 
                  onCheckedChange={setShowAIChart}
                  id="ai-chart-toggle"
                />
                <label htmlFor="ai-chart-toggle" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  AI Patterns
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch 
                  checked={showOrderBook} 
                  onCheckedChange={setShowOrderBook}
                  id="orderbook-toggle"
                />
                <label htmlFor="orderbook-toggle" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                  <BookOpen className="h-3 w-3" />
                  Order Book
                </label>
              </div>
            </div>
          </div>

          {/* Chart and optional order book */}
          <div className="flex-1 flex min-h-0">
            {/* Chart with position overlay */}
            <div className="flex-1 min-w-0 relative">
              {showAIChart ? (
                <PatternChart 
                  symbol={coin} 
                  interval={
                    { "1": "1m", "3": "1m", "5": "5m", "15": "15m", "30": "15m", "60": "1h", "240": "4h", "D": "1h" }[timeframe] || "5m"
                  } 
                  className="h-full" 
                />
              ) : (
                <TradingViewChart symbol={tvSymbol} interval={timeframe} className="h-full" />
              )}
              <ChartPositionOverlay coin={coin} currentPrice={price} />
            </div>
            
            {/* Optional Order Book Panel */}
            {showOrderBook && (
              <div className="w-56 xl:w-64 border-l flex flex-col bg-card/30">
                <div className="flex items-center border-b">
                  <button
                    className={cn(
                      "flex-1 py-2 text-xs font-medium transition-colors",
                      orderBookMode === "book" 
                        ? "bg-muted text-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setOrderBookMode("book")}
                  >
                    Order Book
                  </button>
                  <button
                    className={cn(
                      "flex-1 py-2 text-xs font-medium transition-colors",
                      orderBookMode === "trades" 
                        ? "bg-muted text-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setOrderBookMode("trades")}
                  >
                    Trades
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {orderBookMode === "book" ? (
                    <OrderBook coin={coin} />
                  ) : (
                    <RecentTrades coin={coin} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side - Order Entry Panel */}
        <div className="w-72 xl:w-80 border-l flex flex-col bg-card/30 hidden md:flex">
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-3">
              <OrderEntry 
                coin={coin} 
                currentPrice={price} 
                onOrderSubmit={handleOrderSubmit}
              />
              
              <AccountEquity />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom - Positions and Orders Panel (Hyperliquid style) */}
      <BottomTradingPanel coin={coin} />
    </div>
  );
}
