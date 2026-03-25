import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PatternChart } from "@/components/pattern-chart";
import { TradingViewChart } from "@/components/trading-view-chart";
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
import { usePaywall } from "@/lib/paywall-context";
import { Settings, BookOpen, Brain, ArrowUpDown, Maximize2, Minimize2, Lock, Loader2 } from "lucide-react";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";
import { coinToTradingViewSymbol } from "@/lib/tradingview-symbol";

const LS_COIN = "eq_trading_coin";
const LS_TF = "eq_trading_timeframe";
const LS_CHART_ENGINE = "eq_chart_engine";

type ChartEngine = "hyperliquid" | "tradingview";

const TF_TO_INTERVAL: Record<string, string> = {
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1h", "120": "2h", "240": "4h", "D": "1d",
};

const timeframes = [
  { value: "1", label: "1m" },
  { value: "3", label: "3m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "120", label: "2h" },
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
    const q = params.get("coin");
    if (q) return q;
    try {
      const saved = localStorage.getItem(LS_COIN);
      if (saved) return saved;
    } catch { /* ignore */ }
    return "BTC";
  });
  const [timeframe, setTimeframe] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_TF);
      if (saved && TF_TO_INTERVAL[saved]) return saved;
    } catch { /* ignore */ }
    return "5";
  });
  const [chartEngine, setChartEngine] = useState<ChartEngine>(() => {
    try {
      const v = localStorage.getItem(LS_CHART_ENGINE);
      if (v === "tradingview" || v === "hyperliquid") return v;
    } catch { /* ignore */ }
    return "hyperliquid";
  });
  const [showOrderBook, setShowOrderBook] = useState(false);
  const [orderBookMode, setOrderBookMode] = useState<"book" | "trades">("book");
  const [showAIChart, setShowAIChart] = useState(true);
  const [showIndicators, setShowIndicators] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chart");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isResolvingCoin, setIsResolvingCoin] = useState(false);
  const { toast } = useToast();
  const { updatePrices } = useTrading();
  const { openPaywall } = usePaywall();
  const { hasAccess, isConnected, isLoading: subLoading } = useSubscription();
  const { builderCodeApproved, isCheckingApproval: builderCheckLoading } = useWallet();
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_COIN, coin);
    } catch { /* ignore */ }
  }, [coin]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TF, timeframe);
    } catch { /* ignore */ }
  }, [timeframe]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_CHART_ENGINE, chartEngine);
    } catch { /* ignore */ }
  }, [chartEngine]);

  const chartInterval = TF_TO_INTERVAL[timeframe] || "5m";

  // Basic charting is free for all connected wallets
  const canShowIndicatorChart = isConnected;
  // AI pattern signals and SMA overlays are Pro-only (both gated together)
  const canUseAIPatterns = isConnected && hasAccess('ai_signals');

  // Reset AI chart if user disconnects
  useEffect(() => {
    if (!canShowIndicatorChart && showAIChart) {
      setShowAIChart(false);
    }
  }, [canShowIndicatorChart, showAIChart]);

  // Handler: toggle AI chart with paywall gate
  const handleAIChartToggle = (checked: boolean) => {
    if (checked && !canUseAIPatterns) {
      openPaywall("AI Pattern Recognition");
      return;
    }
    setShowAIChart(checked);
  };

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
      setIsResolvingCoin(false);
      return;
    }
    // Try matching by baseName (e.g. coin="PURR" → ticker with baseName="PURR" and coin="@0")
    const byBase = tickers.find((t: any) => t.baseName === coin || t.displayName?.startsWith(coin + "-"));
    if (byBase) {
      setCoin(byBase.coin);
    }
    setIsResolvingCoin(false);
  }, [tickers, coin]);

  // Log selected asset only when coin changes (not on every ticker refresh)
  useEffect(() => {
    const ticker = tickers.find((t: any) => t.coin === coin);
    console.log("[selectedAsset]", { symbol: ticker?.baseName || coin, coin });
  }, [coin]);

  // Spot markets use @N identifiers
  const isSpot = coin.startsWith("@");

  // Derive display name for spot coins (e.g. "@0" → "PURR")
  const currentTicker = tickers.find((t: any) => t.coin === coin);
  const displaySymbol = currentTicker?.baseName || (isSpot ? coin : coin);

  const tradingViewSymbol = useMemo(
    () => coinToTradingViewSymbol(coin, currentTicker?.baseName),
    [coin, currentTicker?.baseName]
  );

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

  // Wallet gate is handled by WalletGate in App.tsx — no need to re-check here

  return (
    <div className={cn(
      "h-full flex flex-col bg-background",
      isFullscreen && "md:h-full chart-fullscreen"
    )}>
      {/* Top Header - Symbol info bar - hidden in fullscreen on mobile */}
      <div className={cn(
        "relative flex flex-wrap items-center gap-2 md:gap-4 px-2 md:px-3 py-2 border-b bg-card/50",
        isFullscreen && "hidden md:flex",
        isConnected && !builderCheckLoading && !builderCodeApproved && "pt-10 md:pt-10"
      )}>
        {isConnected && !builderCheckLoading && !builderCodeApproved && (
          <div className="absolute left-0 right-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/40 px-3 py-2 text-[11px] md:text-xs text-amber-200">
            <span className="font-medium">Complete builder setup</span>
            <span className="hidden sm:inline opacity-90">— Approve the dialog to trade. You stay on Equilibrium.</span>
          </div>
        )}
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

            {chartEngine === "tradingview" && (
              <span className="hidden md:inline text-[10px] text-amber-500/90 max-w-[160px] leading-tight shrink-0">
                TV: use <strong className="text-foreground">AI</strong> for chart TP/SL (Hyperliquid-style drag)
              </span>
            )}
            <div
              className="flex items-center gap-0.5 shrink-0 border-r border-border/50 pr-1 mr-0.5"
              title="AI = native chart with draggable TP/SL lines (like Hyperliquid). TV = embedded TradingView only."
            >
              <Button
                type="button"
                variant={chartEngine === "hyperliquid" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold"
                onClick={() => setChartEngine("hyperliquid")}
                data-testid="chart-engine-ai"
              >
                AI
              </Button>
              <Button
                type="button"
                variant={chartEngine === "tradingview" ? "secondary" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold"
                onClick={() => setChartEngine("tradingview")}
                data-testid="chart-engine-tv"
              >
                TV
              </Button>
            </div>
            
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
            
            <div className="flex flex-wrap items-center gap-2 md:gap-4 justify-end shrink-0">
              {chartEngine === "hyperliquid" && (
                <>
                  <div className="flex items-center gap-1.5">
                    <Switch 
                      checked={showAIChart} 
                      onCheckedChange={handleAIChartToggle}
                      id="ai-chart-toggle"
                      data-testid="toggle-ai-chart"
                    />
                    <label
                      htmlFor="ai-chart-toggle"
                      className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1"
                      onClick={() => !canUseAIPatterns && openPaywall("AI Pattern Recognition")}
                    >
                      <Brain className="h-3 w-3" />
                      AI Chart
                      {!canUseAIPatterns && <Lock className="h-3 w-3 text-muted-foreground/60" />}
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
                </>
              )}
              <div className="hidden md:flex items-center gap-1.5">
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
                  {chartEngine === "hyperliquid" ? (
                    <PatternChart 
                      key={`lc-${coin}-${chartInterval}`}
                      symbol={coin} 
                      interval={chartInterval}
                      currentPrice={price}
                      patternScanEnabled={canUseAIPatterns && !isSpot}
                      hideIndicators={!showIndicators}
                      className="absolute inset-0" 
                    />
                  ) : (
                    <TradingViewChart
                      key={`tv-${tradingViewSymbol}-${timeframe}`}
                      symbol={tradingViewSymbol}
                      interval={timeframe}
                      className="absolute inset-0"
                    />
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

            {/* Desktop: Chart — always PatternChart so toggling AI mode never remounts the chart */}
            <div className="hidden md:block flex-1 min-w-0 relative">
              {chartEngine === "hyperliquid" ? (
                <PatternChart 
                  key={`lc-${coin}-${chartInterval}`}
                  symbol={coin} 
                  interval={chartInterval}
                  currentPrice={price}
                  patternScanEnabled={canUseAIPatterns && !isSpot}
                  hideIndicators={!showIndicators}
                  className="h-full" 
                />
              ) : (
                <TradingViewChart
                  key={`tv-${tradingViewSymbol}-${timeframe}`}
                  symbol={tradingViewSymbol}
                  interval={timeframe}
                  className="h-full"
                />
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
        <BottomTradingPanel coin={coin} onCoinChange={setCoin} />
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
