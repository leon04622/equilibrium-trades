import { useState, useMemo } from "react";
import { Zap, Filter, TrendingUp, TrendingDown, Clock, Sparkles, RefreshCw, AlertTriangle, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LivePatternCard } from "@/components/live-pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { LivePattern, PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

export default function Signals() {
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: tickers = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 5000,
  });

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const getTickerPrice = (coin: string): number => {
    const ticker = tickers.find((t: any) => t.coin === coin);
    if (ticker && ticker.markPx) {
      const price = parseFloat(ticker.markPx);
      if (isNaN(price) || !isFinite(price)) return 0;
      if (price >= 1000) return Math.round(price * 100) / 100;
      if (price >= 1) return Math.round(price * 100) / 100;
      if (price >= 0.01) return Math.round(price * 10000) / 10000;
      return Math.round(price * 100000000) / 100000000;
    }
    return 0;
  };

  const sanitizePrice = (price: number, basePrice: number): number => {
    if (!price || !isFinite(price)) return 0;
    if (basePrice >= 1000) return Math.round(price * 100) / 100;
    if (basePrice >= 1) return Math.round(price * 100) / 100;
    if (basePrice >= 0.01) return Math.round(price * 10000) / 10000;
    return Math.round(price * 100000000) / 100000000;
  };

  const educationalPatterns: LivePattern[] = useMemo(() => {
    if (tickers.length === 0) return [];

    const btcPrice = getTickerPrice("BTC");
    const ethPrice = getTickerPrice("ETH");
    const solPrice = getTickerPrice("SOL");
    const dogePrice = getTickerPrice("DOGE");
    const bnbPrice = getTickerPrice("BNB");

    const patterns: LivePattern[] = [
      {
        id: "edu-1",
        pattern: tradingPatterns.find(p => p.id === "bull-flag")!,
        symbol: "BTC/USDT",
        timeframe: "1m",
        confidence: 85,
        entryPrice: btcPrice,
        stopLoss: sanitizePrice(btcPrice * 0.995, btcPrice),
        takeProfit: sanitizePrice(btcPrice * 1.015, btcPrice),
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 2 * 60 * 1000),
      },
      {
        id: "edu-2",
        pattern: tradingPatterns.find(p => p.id === "ascending-triangle")!,
        symbol: "ETH/USDT",
        timeframe: "5m",
        confidence: 72,
        entryPrice: ethPrice,
        stopLoss: sanitizePrice(ethPrice * 0.985, ethPrice),
        takeProfit: sanitizePrice(ethPrice * 1.025, ethPrice),
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 8 * 60 * 1000),
      },
      {
        id: "edu-3",
        pattern: tradingPatterns.find(p => p.id === "pennant")!,
        symbol: "SOL/USDT",
        timeframe: "1m",
        confidence: 78,
        entryPrice: solPrice,
        stopLoss: sanitizePrice(solPrice * 0.98, solPrice),
        takeProfit: sanitizePrice(solPrice * 1.03, solPrice),
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        id: "edu-4",
        pattern: tradingPatterns.find(p => p.id === "bear-flag")!,
        symbol: "DOGE/USDT",
        timeframe: "1m",
        confidence: 68,
        entryPrice: dogePrice,
        stopLoss: sanitizePrice(dogePrice * 1.02, dogePrice),
        takeProfit: sanitizePrice(dogePrice * 0.95, dogePrice),
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 12 * 60 * 1000),
      },
      {
        id: "edu-5",
        pattern: tradingPatterns.find(p => p.id === "double-bottom")!,
        symbol: "BNB/USDT",
        timeframe: "15m",
        confidence: 65,
        entryPrice: bnbPrice,
        stopLoss: sanitizePrice(bnbPrice * 0.97, bnbPrice),
        takeProfit: sanitizePrice(bnbPrice * 1.04, bnbPrice),
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 25 * 60 * 1000),
      },
    ];
    return patterns.filter(p => p.pattern && (p.entryPrice ?? 0) > 0);
  }, [tickers]);

  const bullishPatterns = educationalPatterns.filter(p => p.pattern.direction === "bullish");
  const bearishPatterns = educationalPatterns.filter(p => p.pattern.direction === "bearish");

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Pattern Examples</h1>
          <Badge className="ml-2 bg-amber-500/15 text-amber-600 border-amber-500/30">
            <BookOpen className="h-3 w-3 mr-1" />
            Educational
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="ml-auto"
            data-testid="button-refresh-signals"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")} />
            Refresh Prices
          </Button>
        </div>
        <p className="text-muted-foreground">
          Learn to identify trading patterns with real-time price examples
        </p>
      </div>

      {/* Important Disclaimer */}
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">Educational Examples Only</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          These patterns are <strong>examples for learning purposes</strong> using live market prices. 
          They are NOT real-time pattern detections and should NOT be used as trading signals. 
          Always verify patterns on the actual chart before making any trading decisions.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{educationalPatterns.length}</p>
                <p className="text-xs text-muted-foreground">Example Patterns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bullishPatterns.length}</p>
                <p className="text-xs text-muted-foreground">Bullish Examples</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/15">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bearishPatterns.length}</p>
                <p className="text-xs text-muted-foreground">Bearish Examples</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">Demo</p>
                <p className="text-xs text-muted-foreground">Not Live Signals</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {tickers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-sm">Live Market Prices (from Hyperliquid)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {["BTC", "ETH", "SOL", "DOGE", "BNB", "XRP", "AVAX", "LINK"].map(coin => {
                const ticker = tickers.find((t: any) => t.coin === coin);
                if (!ticker) return null;
                const price = parseFloat(ticker.markPx);
                const change = parseFloat(ticker.prevDayPx) > 0 
                  ? ((price - parseFloat(ticker.prevDayPx)) / parseFloat(ticker.prevDayPx)) * 100 
                  : 0;
                return (
                  <div key={coin} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                    <span className="font-semibold text-sm">{coin}</span>
                    <span className="font-mono text-sm">${formatPrice(price)}</span>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-xs",
                        change >= 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display">How to Use These Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-sm">Study the Pattern</p>
                <p className="text-xs text-muted-foreground">
                  Click "Learn More" to understand the pattern structure and characteristics
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-sm">Check the Real Chart</p>
                <p className="text-xs text-muted-foreground">
                  Go to Trading and look for the pattern on the actual TradingView chart
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-sm">Practice Identification</p>
                <p className="text-xs text-muted-foreground">
                  Use the entry, SL, and TP examples as learning reference only
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Examples ({educationalPatterns.length})</TabsTrigger>
          <TabsTrigger value="bullish">Bullish ({bullishPatterns.length})</TabsTrigger>
          <TabsTrigger value="bearish">Bearish ({bearishPatterns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground mb-4 animate-spin" />
              <p className="text-muted-foreground">Loading price data...</p>
            </div>
          ) : educationalPatterns.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Loading examples...</p>
              <p className="text-muted-foreground">Waiting for market data</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {educationalPatterns.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
                  isEducational={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bullish" className="space-y-4">
          {bullishPatterns.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No bullish examples</p>
              <p className="text-muted-foreground">Check back for more patterns</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bullishPatterns.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
                  isEducational={true}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bearish" className="space-y-4">
          {bearishPatterns.length === 0 ? (
            <div className="text-center py-12">
              <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No bearish examples</p>
              <p className="text-muted-foreground">Check back for more patterns</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bearishPatterns.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
                  isEducational={true}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PatternModal
        pattern={selectedPattern}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
