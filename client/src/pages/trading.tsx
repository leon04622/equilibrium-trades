import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradingViewChart } from "@/components/trading-view-chart";
import { SMAIndicator } from "@/components/sma-indicator";
import { LivePatternCard } from "@/components/live-pattern-card";
import { SymbolSelector } from "@/components/symbol-selector";
import { OrderBook } from "@/components/order-book";
import { RecentTrades } from "@/components/recent-trades";
import { PositionsPanel } from "@/components/positions-panel";
import { PatternModal } from "@/components/pattern-modal";
import { OrderEntry } from "@/components/order-entry";
import { ChartPatternOverlay } from "@/components/chart-pattern-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { RefreshCcw, Sparkles, Settings, Info } from "lucide-react";
import { tradingPatterns } from "@/lib/patterns";
import type { LivePattern, MarketCondition, PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";

const timeframes = [
  { value: "1", label: "1m" },
  { value: "3", label: "3m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
  { value: "240", label: "4h" },
  { value: "D", label: "D" },
  { value: "M", label: "M" },
];

export default function Trading() {
  const [coin, setCoin] = useState("BTC");
  const [timeframe, setTimeframe] = useState("5");
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [livePatterns, setLivePatterns] = useState<LivePattern[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [activeTab, setActiveTab] = useState<"chart" | "orderbook" | "trades">("chart");
  const { toast } = useToast();

  // Build TradingView symbol from coin - use Binance as TradingView source for reliability
  const tvSymbol = `BINANCE:${coin}USDT`;

  const handleOrderSubmit = (order: any) => {
    toast({
      title: `${order.side === "buy" ? "Buy" : "Sell"} Order Submitted`,
      description: `${order.quantity} ${coin} at ${order.type === "market" ? "market price" : `$${order.price}`}`,
    });
  };

  // Fetch market condition from API
  const { data: marketCondition, isLoading: isLoadingMarket } = useQuery<MarketCondition>({
    queryKey: ["/api/market", tvSymbol],
    refetchInterval: 30000,
  });

  // Fetch ticker data
  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 3000,
  });

  const currentTicker = tickers.find((t) => t.coin === coin);
  const price = currentTicker ? parseFloat(currentTicker.markPx) : 0;
  const prevPrice = currentTicker ? parseFloat(currentTicker.prevDayPx) : price;
  const priceChange = prevPrice > 0 ? price - prevPrice : 0;
  const priceChangePercent = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;

  const displayMarketCondition: MarketCondition = marketCondition || {
    symbol: `${coin}/USDC`,
    currentPrice: price,
    sma21_1m: price * 0.998,
    sma200_1m: price * 0.995,
    sma200_5m: price * 0.99,
    trend: priceChangePercent >= 0 ? "bullish" : "bearish",
    crossoverActive: true,
    above5mSma200: true,
  };

  // Detect patterns when coin/timeframe changes
  useEffect(() => {
    setLivePatterns([]);
    const timer = setTimeout(() => {
      detectPatterns();
    }, 1000);
    return () => clearTimeout(timer);
  }, [coin, timeframe]);

  const detectPatterns = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch("/api/detect-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: tvSymbol, timeframe }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      const newPatterns: LivePattern[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "pattern") {
              const patternDef = tradingPatterns.find(
                (p) =>
                  p.id === data.data.patternId ||
                  p.name.toLowerCase().includes(data.data.patternName?.toLowerCase())
              );

              if (patternDef) {
                newPatterns.push({
                  id: Math.random().toString(36).substring(7),
                  pattern: patternDef,
                  symbol: `${coin}/USDC`,
                  timeframe: timeframe + "m",
                  confidence: data.data.confidence,
                  entryPrice: data.data.entryPrice,
                  stopLoss: data.data.stopLoss,
                  takeProfit: data.data.takeProfit,
                  status: "forming",
                  detectedAt: new Date(),
                });
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      // Only show forming patterns
      const formingPatterns = newPatterns.filter((p) => p.status === "forming");
      setLivePatterns(formingPatterns.slice(0, 3));
    } catch (error) {
      console.error("Pattern detection error:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with symbol and price */}
      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b">
        <div className="flex items-center gap-4">
          <SymbolSelector currentSymbol={coin} onSymbolChange={setCoin} />
          
          {/* Price display */}
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Mark</span>
              <p className="font-mono font-semibold">{formatPrice(price)}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">24h Change</span>
              <p className={cn(
                "font-mono font-semibold",
                priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {priceChange >= 0 ? "+" : ""}{formatPrice(priceChange)} ({priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {displayMarketCondition.crossoverActive && (
            <Badge variant="outline" className="bg-bullish/15 text-bullish border-bullish/30 text-xs">
              SMA Cross Active
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left panel - Chart area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs for Chart/OrderBook/Trades */}
          <div className="flex items-center justify-between border-b px-2">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="bg-transparent h-10 p-0 gap-0">
                <TabsTrigger
                  value="chart"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  data-testid="tab-chart"
                >
                  Chart
                </TabsTrigger>
                <TabsTrigger
                  value="orderbook"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  data-testid="tab-orderbook"
                >
                  Order Book
                </TabsTrigger>
                <TabsTrigger
                  value="trades"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4"
                  data-testid="tab-trades"
                >
                  Trades
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Timeframe selector */}
            <div className="flex items-center gap-1 py-1 overflow-x-auto">
              {timeframes.map((tf) => (
                <Button
                  key={tf.value}
                  variant={timeframe === tf.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs font-mono"
                  onClick={() => setTimeframe(tf.value)}
                  data-testid={`timeframe-${tf.value}`}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Chart/OrderBook/Trades content */}
          <div className="flex-1 min-h-0 relative">
            {activeTab === "chart" && (
              <>
                <TradingViewChart symbol={tvSymbol} interval={timeframe} className="h-full" />
                <ChartPatternOverlay 
                  patterns={livePatterns} 
                  currentPrice={price} 
                  chartHeight={400} 
                />
              </>
            )}
            {activeTab === "orderbook" && <OrderBook coin={coin} />}
            {activeTab === "trades" && <RecentTrades coin={coin} />}
          </div>
        </div>

        {/* Order Entry Panel */}
        <div className="w-64 xl:w-72 border-l flex-col hidden xl:flex">
          <ScrollArea className="flex-1">
            <div className="p-3">
              <OrderEntry 
                coin={coin} 
                currentPrice={price} 
                onOrderSubmit={handleOrderSubmit}
              />
            </div>
          </ScrollArea>
        </div>

        {/* Right panel - Patterns and SMA */}
        <div className="w-72 xl:w-80 border-l flex flex-col hidden lg:flex">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {/* SMA Indicator */}
              {isLoadingMarket ? (
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </CardContent>
                </Card>
              ) : (
                <SMAIndicator marketCondition={displayMarketCondition} />
              )}

              {/* Forming Patterns Only */}
              <Card>
                <div className="flex items-center justify-between p-3 border-b">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Forming Patterns</span>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={detectPatterns}
                    disabled={isDetecting}
                    data-testid="button-refresh-patterns"
                  >
                    <RefreshCcw className={`h-3 w-3 ${isDetecting ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <CardContent className="p-3 space-y-2">
                  {isDetecting && livePatterns.length === 0 ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : livePatterns.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No patterns forming</p>
                      <p className="text-[10px] mt-1">Scanning for setups...</p>
                    </div>
                  ) : (
                    livePatterns.map((livePattern) => (
                      <LivePatternCard
                        key={livePattern.id}
                        livePattern={livePattern}
                        onLearnMore={() => handleLearnMore(livePattern.pattern)}
                        compact
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Quick tip */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Strategy Tip:</span> Wait for
                    21 SMA to cross above 200 SMA on 1m chart, then look for bull flags or
                    ascending triangles for entry.
                  </p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Bottom positions panel */}
      <PositionsPanel connected={false} />

      <PatternModal pattern={selectedPattern} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
