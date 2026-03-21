import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { TradingViewChart } from "@/components/trading-view-chart";
import { PatternChart } from "@/components/pattern-chart";
import { SymbolSelector } from "@/components/symbol-selector";
import { OrderBook } from "@/components/order-book";
import { RecentTrades } from "@/components/recent-trades";
import { OrderEntry } from "@/components/order-entry";
import { AccountEquity } from "@/components/account-equity";
import { BottomTradingPanel } from "@/components/bottom-trading-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { Settings, BookOpen, Brain, ArrowUpDown, Maximize2, Minimize2, Lock, Zap, Loader2 } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import type { MarketCondition } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


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

type MobileTab = "chart" | "orderbook" | "trades";

export default function Trading({ visible = true }: TradingProps) {
  const [coin, setCoin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("coin") || "BTC";
  });
  const [timeframe, setTimeframe] = useState("5");
  const [showOrderBook, setShowOrderBook] = useState(false);
  const [orderBookMode, setOrderBookMode] = useState<"book" | "trades">("book");
  const [showAIChart, setShowAIChart] = useState(true);
  const [showIndicators, setShowIndicators] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chart");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResolvingCoin, setIsResolvingCoin] = useState(false);
  const { toast } = useToast();
  const { updatePrices } = useTrading();
  const { hasAccess, isConnected, isPro, isLoading: subLoading } = useSubscription();
  const [location] = useLocation();

  // When navigating to /trading?coin=XXX (e.g. from portfolio Trade button),
  // update the selected coin. Wouter includes query string in location, so
  // we check startsWith and parse coin from the location string directly.
  useEffect(() => {
    if (!location.startsWith("/trading")) return;
    const qIndex = location.indexOf("?");
    const search = qIndex !== -1 ? location.slice(qIndex) : window.location.search;
    const params = new URLSearchParams(search);
    const coinParam = params.get("coin");
    if (coinParam) {
      setIsResolvingCoin(true);
      setCoin(coinParam);
    }
  }, [location]);
  
  // Chart with indicators (Volume/RSI/Stoch RSI) is free for all connected users
  const canShowIndicatorChart = isConnected;
  // AI pattern signal cards are Pro-only
  const canUseAIPatterns = isConnected && hasAccess('ai_signals');
  
  // Reset AI chart if user disconnects
  useEffect(() => {
    if (!canShowIndicatorChart && showAIChart) {
      setShowAIChart(false);
    }
  }, [canShowIndicatorChart, showAIChart]);

  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: visible ? 3000 : false,
    enabled: visible,
  });

  // Resolve coin name → @N spot identifier if needed.
  // Spot balances from Hyperliquid return token names (e.g. "PURR"), but tickers
  // use the @N format (e.g. "@0"). When tickers load, normalise the coin.
  useEffect(() => {
    if (tickers.length === 0) return;
    const directMatch = tickers.find((t: any) => t.coin === coin);
    if (directMatch) {
      console.log("[selectedAsset]", { symbol: directMatch.baseName || directMatch.coin, coin: directMatch.coin });
      setIsResolvingCoin(false);
      return;
    }
    // Try matching by baseName (e.g. coin="PURR" → ticker with baseName="PURR" and coin="@0")
    const byBase = tickers.find((t: any) => t.baseName === coin || t.displayName?.startsWith(coin + "-"));
    if (byBase) {
      console.log("[selectedAsset] resolved spot token", coin, "→", byBase.coin, { symbol: byBase.baseName || byBase.coin, coin: byBase.coin });
      setCoin(byBase.coin);
    } else {
      console.log("[selectedAsset] no ticker found for", coin);
    }
    setIsResolvingCoin(false);
  }, [tickers, coin]);

  // Spot markets use @N identifiers — TradingView has no equivalent, so we
  // use the PatternChart (Hyperliquid native candles) as the primary chart for them.
  const isSpot = coin.startsWith("@");
  const tvSymbol = isSpot ? "" : `BINANCE:${coin}USDT`;

  // Derive display name for spot coins (e.g. "@0" → "PURR")
  const currentTicker = tickers.find((t: any) => t.coin === coin);
  const displaySymbol = currentTicker?.baseName || (isSpot ? coin : coin);

  const handleOrderSubmit = (order: any) => {
    toast({
      title: `${order.side === "buy" ? "Long" : "Short"} Order Submitted`,
      description: `${order.quantity} ${displaySymbol} at $${order.price?.toLocaleString() || "market"}`,
    });
  };
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

  // Show loading spinner while resolving coin from URL (e.g. spot token name → @N id)
  if (isResolvingCoin) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading asset...</p>
        </div>
      </div>
    );
  }

  // Show loading spinner while checking subscription (prevents bypass during load)
  if (subLoading && isConnected) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Checking subscription...</p>
        </div>
      </div>
    );
  }

  // Show subscription gate if wallet connected but no active Pro subscription
  if (!subLoading && isConnected && !isPro) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Pro Access Required</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Subscribe to Equilibrium Pro to access the live trading platform.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="rounded-lg bg-muted/50 p-4 text-sm text-left space-y-2">
              <p className="font-medium text-foreground">Pro Access includes:</p>
              <ul className="text-muted-foreground space-y-1">
                <li>✓ Live trading on Hyperliquid</li>
                <li>✓ AI pattern detection signals</li>
                <li>✓ 200+ perpetual and spot markets</li>
                <li>✓ Real-time order book &amp; positions</li>
              </ul>
            </div>
            <Link href="/pricing">
              <Button className="w-full" size="lg" data-testid="button-subscribe-trading">
                <Zap className="mr-2 h-4 w-4" />
                Subscribe — £50/month
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              Already subscribed? Make sure you connected the same wallet used during checkout.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show connect wallet prompt if wallet not connected
  if (!subLoading && !isConnected) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Connect Your Wallet</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your wallet to access the trading platform.
            </p>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Use the Connect button in the top right corner to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn(
      "h-full flex flex-col bg-background",
      isFullscreen && "md:h-full chart-fullscreen"
    )}>
      {/* Top Header - Symbol info bar - hidden in fullscreen on mobile */}
      <div className={cn(
        "flex items-center gap-2 md:gap-4 px-2 md:px-3 py-2 border-b bg-card/50",
        isFullscreen && "hidden md:flex"
      )}>
        <SymbolSelector currentSymbol={coin} onSymbolChange={setCoin} />
        
        <Separator orientation="vertical" className="h-6 hidden sm:block" />
        
        {/* Price and stats */}
        <div className="flex items-center gap-3 md:gap-6 text-xs overflow-x-auto flex-1">
          <div className="shrink-0">
            <span className="text-muted-foreground text-[10px] md:text-xs">Mark</span>
            <p className={cn(
              "font-mono font-bold text-sm md:text-base",
              priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {formatPrice(price)}
            </p>
          </div>
          
          <div className="shrink-0">
            <span className="text-muted-foreground text-[10px] md:text-xs">24h Change</span>
            <p className={cn(
              "font-mono font-semibold text-[11px] md:text-xs",
              priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
            </p>
          </div>
          
          <div className="hidden md:block shrink-0">
            <span className="text-muted-foreground">24h Volume</span>
            <p className="font-mono">{formatVolume(volume24h)}</p>
          </div>
          
          {!isSpot && (
            <div className="hidden lg:block shrink-0">
              <span className="text-muted-foreground">Open Interest</span>
              <p className="font-mono">{formatVolume(openInterest)}</p>
            </div>
          )}
          
          {!isSpot && (
            <div className="hidden lg:block shrink-0">
              <span className="text-muted-foreground">Funding</span>
              <p className={cn(
                "font-mono",
                fundingRate >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {(fundingRate * 100).toFixed(4)}%
              </p>
            </div>
          )}

          {isSpot && (
            <div className="hidden lg:block shrink-0">
              <span className="text-muted-foreground">Type</span>
              <p className="font-mono text-blue-400">Spot</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile Tab Bar (Chart / Order Book / Trades) - Hyperliquid style - hidden in fullscreen */}
      <div className={cn(
        "md:hidden flex items-center border-b bg-card/30",
        isFullscreen && "hidden"
      )}>
        <button
          onClick={() => setMobileTab("chart")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors relative",
            mobileTab === "chart" ? "text-foreground" : "text-muted-foreground"
          )}
          data-testid="mobile-tab-chart"
        >
          Chart
          {mobileTab === "chart" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setMobileTab("orderbook")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors relative",
            mobileTab === "orderbook" ? "text-foreground" : "text-muted-foreground"
          )}
          data-testid="mobile-tab-orderbook"
        >
          Order Book
          {mobileTab === "orderbook" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          onClick={() => setMobileTab("trades")}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors relative",
            mobileTab === "trades" ? "text-foreground" : "text-muted-foreground"
          )}
          data-testid="mobile-tab-trades"
        >
          Trades
          {mobileTab === "trades" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {/* Main trading area - fills remaining space */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left side - Chart */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Chart toolbar - only show when chart tab is active on mobile */}
          <div className={cn(
            "flex items-center justify-between px-1 md:px-2 py-1 border-b gap-1 md:gap-2 shrink-0",
            mobileTab !== "chart" && !isFullscreen && "hidden md:flex"
          )}>
            {/* Fullscreen toggle for mobile - exit button when fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-7 w-7 shrink-0"
              onClick={() => setIsFullscreen(!isFullscreen)}
              data-testid="button-fullscreen-toggle"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            
            <div className="flex items-center gap-0.5 md:gap-1 overflow-x-auto flex-1">
              {timeframes.map((tf) => (
                <Button
                  key={tf.value}
                  variant={timeframe === tf.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 md:h-7 px-1.5 md:px-2 text-[10px] md:text-xs font-mono shrink-0"
                  onClick={() => setTimeframe(tf.value)}
                  data-testid={`timeframe-${tf.value}`}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
            
            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Switch 
                  checked={showAIChart} 
                  onCheckedChange={setShowAIChart}
                  id="ai-chart-toggle"
                />
                <label htmlFor="ai-chart-toggle" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  AI Chart
                </label>
              </div>
              {showAIChart && (
                <div className="flex items-center gap-1.5">
                  <Switch 
                    checked={showIndicators} 
                    onCheckedChange={setShowIndicators}
                    id="indicators-toggle"
                  />
                  <label htmlFor="indicators-toggle" className="text-xs text-muted-foreground cursor-pointer">
                    RSI / Stoch
                  </label>
                </div>
              )}
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

          {/* Chart and optional order book - fills remaining space */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Mobile: Show content based on selected tab */}
            <div className={cn(
              "md:hidden flex-1 min-w-0 min-h-0 flex flex-col",
              !isFullscreen && mobileTab !== "chart" && mobileTab !== "orderbook" && mobileTab !== "trades" && "hidden",
              isFullscreen && "chart-wrapper-mobile"
            )}>
              {(mobileTab === "chart" || isFullscreen) && (
                <div className="flex-1 relative" style={{ minHeight: 'calc(100dvh - 16rem)' }}>
                  {showAIChart || isSpot ? (
                    <PatternChart 
                      symbol={coin} 
                      interval={
                        { "1": "1m", "3": "1m", "5": "5m", "15": "15m", "30": "15m", "60": "1h", "240": "4h", "D": "1h" }[timeframe] || "5m"
                      }
                      currentPrice={price}
                      showSignals={canUseAIPatterns && !isSpot}
                      hideIndicators={!showIndicators}
                      className="absolute inset-0" 
                    />
                  ) : (
                    <TradingViewChart symbol={tvSymbol} interval={timeframe} hideVolume className="absolute inset-0" />
                  )}
                </div>
              )}
              {!isFullscreen && mobileTab === "orderbook" && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <OrderBook coin={coin} />
                </div>
              )}
              {!isFullscreen && mobileTab === "trades" && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <RecentTrades coin={coin} />
                </div>
              )}
            </div>

            {/* Desktop: Chart */}
            <div className="hidden md:block flex-1 min-w-0 relative">
              {showAIChart || isSpot ? (
                <PatternChart 
                  symbol={coin} 
                  interval={
                    { "1": "1m", "3": "1m", "5": "5m", "15": "15m", "30": "15m", "60": "1h", "240": "4h", "D": "1h" }[timeframe] || "5m"
                  }
                  currentPrice={price}
                  showSignals={canUseAIPatterns && !isSpot}
                  hideIndicators={!showIndicators}
                  className="h-full" 
                />
              ) : (
                <TradingViewChart symbol={tvSymbol} interval={timeframe} className="h-full" />
              )}
            </div>
            
            {/* Optional Order Book Panel - Desktop only */}
            {showOrderBook && (
              <div className="hidden md:flex w-56 xl:w-64 border-l flex-col bg-card/30">
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

      {/* Bottom - Positions and Orders Panel (Hyperliquid style) - hidden in fullscreen on mobile */}
      <div className={cn(isFullscreen && "hidden md:block")}>
        <BottomTradingPanel coin={coin} />
      </div>

      {/* Mobile Order Entry Button - positioned above the collapsed bottom panel - hidden in fullscreen */}
      <div className={cn(
        "md:hidden fixed bottom-12 right-3 z-50",
        isFullscreen && "hidden"
      )}>
        <Sheet>
          <SheetTrigger asChild>
            <Button 
              size="lg" 
              className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
              data-testid="button-mobile-order"
            >
              <ArrowUpDown className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[80vh] rounded-t-xl">
            <SheetHeader className="pb-2">
              <SheetTitle className="text-center">Trade {displaySymbol}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto h-full pb-8">
              <div className="space-y-4 px-2">
                <OrderEntry 
                  coin={coin} 
                  currentPrice={price} 
                  onOrderSubmit={handleOrderSubmit}
                />
                <AccountEquity />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
