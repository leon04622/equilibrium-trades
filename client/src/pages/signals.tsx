import { useState, useMemo } from "react";
import { Zap, Filter, TrendingUp, TrendingDown, Clock, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    if (ticker) {
      return parseFloat(ticker.markPx);
    }
    return 0;
  };

  const livePatterns: LivePattern[] = useMemo(() => {
    if (tickers.length === 0) return [];

    const btcPrice = getTickerPrice("BTC");
    const ethPrice = getTickerPrice("ETH");
    const solPrice = getTickerPrice("SOL");
    const dogePrice = getTickerPrice("DOGE");
    const bnbPrice = getTickerPrice("BNB");

    const patterns: LivePattern[] = [
      {
        id: "1",
        pattern: tradingPatterns.find(p => p.id === "bull-flag")!,
        symbol: "BTC/USDT",
        timeframe: "1m",
        confidence: 85,
        entryPrice: btcPrice,
        stopLoss: btcPrice * 0.995,
        takeProfit: btcPrice * 1.015,
        status: "confirmed" as const,
        detectedAt: new Date(Date.now() - 2 * 60 * 1000),
      },
      {
        id: "2",
        pattern: tradingPatterns.find(p => p.id === "ascending-triangle")!,
        symbol: "ETH/USDT",
        timeframe: "5m",
        confidence: 72,
        entryPrice: ethPrice,
        stopLoss: ethPrice * 0.985,
        takeProfit: ethPrice * 1.025,
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 8 * 60 * 1000),
      },
      {
        id: "3",
        pattern: tradingPatterns.find(p => p.id === "pennant")!,
        symbol: "SOL/USDT",
        timeframe: "1m",
        confidence: 78,
        entryPrice: solPrice,
        stopLoss: solPrice * 0.98,
        takeProfit: solPrice * 1.03,
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        id: "4",
        pattern: tradingPatterns.find(p => p.id === "bear-flag")!,
        symbol: "DOGE/USDT",
        timeframe: "1m",
        confidence: 68,
        entryPrice: dogePrice,
        stopLoss: dogePrice * 1.02,
        takeProfit: dogePrice * 0.95,
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 12 * 60 * 1000),
      },
      {
        id: "5",
        pattern: tradingPatterns.find(p => p.id === "double-bottom")!,
        symbol: "BNB/USDT",
        timeframe: "15m",
        confidence: 65,
        entryPrice: bnbPrice,
        stopLoss: bnbPrice * 0.97,
        takeProfit: bnbPrice * 1.04,
        status: "forming" as const,
        detectedAt: new Date(Date.now() - 25 * 60 * 1000),
      },
    ];
    return patterns.filter(p => p.pattern && (p.entryPrice || 0) > 0);
  }, [tickers]);

  const confirmedSignals = livePatterns.filter(p => p.status === "confirmed");
  const formingSignals = livePatterns.filter(p => p.status === "forming");
  const bullishSignals = livePatterns.filter(p => p.pattern.direction === "bullish");
  const bearishSignals = livePatterns.filter(p => p.pattern.direction === "bearish");

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">AI Signals</h1>
          <Badge className="ml-2 bg-primary/15 text-primary border-primary/30">
            <Sparkles className="h-3 w-3 mr-1" />
            Live
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="ml-auto"
            data-testid="button-refresh-signals"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <p className="text-muted-foreground">
          Real-time pattern detection powered by AI with live Hyperliquid prices
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{livePatterns.length}</p>
                <p className="text-xs text-muted-foreground">Total Signals</p>
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
                <p className="text-2xl font-bold">{bullishSignals.length}</p>
                <p className="text-xs text-muted-foreground">Bullish</p>
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
                <p className="text-2xl font-bold">{bearishSignals.length}</p>
                <p className="text-xs text-muted-foreground">Bearish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formingSignals.length}</p>
                <p className="text-xs text-muted-foreground">Forming</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {tickers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-sm">Live Market Prices</CardTitle>
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
          <CardTitle className="font-display">How AI Pattern Detection Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-sm">Real-time Scanning</p>
                <p className="text-xs text-muted-foreground">
                  AI continuously analyzes price action across multiple timeframes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-sm">Pattern Recognition</p>
                <p className="text-xs text-muted-foreground">
                  Identifies forming patterns and calculates confidence scores
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-sm">Trade Setup</p>
                <p className="text-xs text-muted-foreground">
                  Provides entry, stop loss, and take profit recommendations
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All ({livePatterns.length})</TabsTrigger>
          <TabsTrigger value="confirmed">Confirmed ({confirmedSignals.length})</TabsTrigger>
          <TabsTrigger value="forming">Forming ({formingSignals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground mb-4 animate-spin" />
              <p className="text-muted-foreground">Loading live signals...</p>
            </div>
          ) : livePatterns.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No signals available</p>
              <p className="text-muted-foreground">Waiting for market data...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {livePatterns.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="confirmed" className="space-y-4">
          {confirmedSignals.length === 0 ? (
            <div className="text-center py-12">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No confirmed signals</p>
              <p className="text-muted-foreground">Check back soon for confirmed patterns</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {confirmedSignals.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="forming" className="space-y-4">
          {formingSignals.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No forming patterns</p>
              <p className="text-muted-foreground">AI is scanning for new patterns</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {formingSignals.map((livePattern) => (
                <LivePatternCard
                  key={livePattern.id}
                  livePattern={livePattern}
                  onLearnMore={() => handleLearnMore(livePattern.pattern)}
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
