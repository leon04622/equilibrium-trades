import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { TradingViewChart } from "@/components/trading-view-chart";
import { SMAIndicator } from "@/components/sma-indicator";
import { LivePatternCard } from "@/components/live-pattern-card";
import { EducationalTip, tradingTips } from "@/components/educational-tip";
import { HyperliquidStatus } from "@/components/hyperliquid-status";
import { SymbolSelector } from "@/components/symbol-selector";
import { TimeframeSelector } from "@/components/timeframe-selector";
import { PatternModal } from "@/components/pattern-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCcw, Sparkles } from "lucide-react";
import { tradingPatterns, getPatternById } from "@/lib/patterns";
import type { LivePattern, MarketCondition, PatternDefinition } from "@shared/schema";

export default function Trading() {
  const [symbol, setSymbol] = useState("BINANCE:BTCUSDT");
  const [timeframe, setTimeframe] = useState("1");
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [livePatterns, setLivePatterns] = useState<LivePattern[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // Fetch market condition from API
  const { data: marketCondition, isLoading: isLoadingMarket, refetch: refetchMarket } = useQuery<MarketCondition>({
    queryKey: ["/api/market", symbol],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch persisted patterns from API
  const normalizedSymbol = symbol.split(":")[1] || "BTCUSDT";
  const { data: storedPatterns = [], refetch: refetchPatterns } = useQuery<any[]>({
    queryKey: [`/api/patterns/symbol/${normalizedSymbol}`],
  });

  // Default market condition while loading
  const displayMarketCondition: MarketCondition = marketCondition || {
    symbol: symbol.split(":")[1] || "BTC/USDT",
    currentPrice: 98432,
    sma21_1m: 98380,
    sma200_1m: 98150,
    sma200_5m: 97800,
    trend: "bullish",
    crossoverActive: true,
    above5mSma200: true,
  };

  // Merge stored patterns with live patterns on load
  useEffect(() => {
    if (storedPatterns.length > 0 && livePatterns.length === 0) {
      const mappedPatterns: LivePattern[] = storedPatterns
        .map((sp: any) => {
          const patternDef = tradingPatterns.find(p => p.id === sp.patternId);
          if (!patternDef) return null; // Skip patterns without valid definitions
          return {
            id: sp.id,
            pattern: patternDef,
            symbol: sp.symbol,
            timeframe: sp.timeframe,
            confidence: sp.confidence,
            entryPrice: sp.entryPrice,
            stopLoss: sp.stopLoss,
            takeProfit: sp.takeProfit,
            status: sp.status || "forming",
            detectedAt: new Date(sp.detectedAt),
          };
        })
        .filter((p): p is LivePattern => p !== null);
      setLivePatterns(mappedPatterns.slice(0, 5));
    }
  }, [storedPatterns]);

  // Clear patterns when symbol changes and trigger fresh detection
  useEffect(() => {
    setLivePatterns([]);
    // Automatically scan for patterns when symbol/timeframe changes
    const timer = setTimeout(() => {
      detectPatterns();
    }, 1000);
    return () => clearTimeout(timer);
  }, [symbol, timeframe]);

  // Detect patterns using AI
  const detectPatterns = async () => {
    setIsDetecting(true);
    try {
      const response = await fetch("/api/detect-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, timeframe }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      const newPatterns: LivePattern[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.startsWith("data: "));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "pattern") {
              const patternDef = tradingPatterns.find(p => 
                p.id === data.data.patternId || 
                p.name.toLowerCase().includes(data.data.patternName?.toLowerCase())
              );
              
              if (patternDef) {
                newPatterns.push({
                  id: Math.random().toString(36).substring(7),
                  pattern: patternDef,
                  symbol: symbol.split(":")[1]?.replace("USDT", "/USDT") || "BTC/USDT",
                  timeframe: timeframe + "m",
                  confidence: data.data.confidence,
                  entryPrice: data.data.entryPrice,
                  stopLoss: data.data.stopLoss,
                  takeProfit: data.data.takeProfit,
                  status: data.data.confidence >= 70 ? "confirmed" : "forming",
                  detectedAt: new Date(),
                });
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      if (newPatterns.length > 0) {
        setLivePatterns(prev => [...newPatterns, ...prev].slice(0, 5));
        // Refresh stored patterns after detection
        refetchPatterns();
      }
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

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
          <div className="flex items-center gap-3">
            <SymbolSelector 
              currentSymbol={symbol} 
              onSymbolChange={setSymbol} 
            />
            <TimeframeSelector 
              currentTimeframe={timeframe} 
              onTimeframeChange={setTimeframe} 
            />
          </div>
          <div className="flex items-center gap-2">
            {displayMarketCondition.crossoverActive ? (
              <Badge 
                variant="outline" 
                className="bg-bullish/15 text-bullish border-bullish/30"
              >
                SMA Cross Active
              </Badge>
            ) : (
              <Badge variant="secondary">Waiting for Crossover</Badge>
            )}
            <Badge variant="secondary">
              {livePatterns.length} Patterns Detected
            </Badge>
          </div>
        </div>

        <div className="flex-1 min-h-[400px] lg:min-h-0">
          <TradingViewChart 
            symbol={symbol} 
            interval={timeframe}
            className="h-full"
          />
        </div>
      </div>

      <div className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isLoadingMarket ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ) : (
              <SMAIndicator marketCondition={displayMarketCondition} />
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base font-display">Live Patterns</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={detectPatterns}
                      disabled={isDetecting}
                      data-testid="button-refresh-patterns"
                    >
                      <RefreshCcw className={`h-4 w-4 ${isDetecting ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isDetecting && livePatterns.length === 0 ? (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : livePatterns.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">No patterns detected yet</p>
                    <p className="text-xs mt-1">Click refresh to scan for patterns</p>
                  </div>
                ) : (
                  livePatterns.map((livePattern) => (
                    <LivePatternCard
                      key={livePattern.id}
                      livePattern={livePattern}
                      onLearnMore={() => handleLearnMore(livePattern.pattern)}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <HyperliquidStatus 
              connected={false}
              onConnect={() => {}}
            />

            <EducationalTip tips={tradingTips.slice(0, 3)} />
          </div>
        </ScrollArea>
      </div>

      <PatternModal
        pattern={selectedPattern}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
