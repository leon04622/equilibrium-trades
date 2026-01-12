import { useState } from "react";
import { Zap, Filter, TrendingUp, TrendingDown, Clock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LivePatternCard } from "@/components/live-pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { LivePattern, PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function Signals() {
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  // Mock live patterns
  const livePatterns: LivePattern[] = [
    {
      id: "1",
      pattern: tradingPatterns.find(p => p.id === "bull-flag")!,
      symbol: "BTC/USDT",
      timeframe: "1m",
      confidence: 85,
      entryPrice: 98500,
      stopLoss: 98100,
      takeProfit: 99200,
      status: "confirmed",
      detectedAt: new Date(Date.now() - 2 * 60 * 1000),
    },
    {
      id: "2",
      pattern: tradingPatterns.find(p => p.id === "ascending-triangle")!,
      symbol: "ETH/USDT",
      timeframe: "5m",
      confidence: 72,
      entryPrice: 3425,
      stopLoss: 3380,
      takeProfit: 3510,
      status: "forming",
      detectedAt: new Date(Date.now() - 8 * 60 * 1000),
    },
    {
      id: "3",
      pattern: tradingPatterns.find(p => p.id === "pennant")!,
      symbol: "SOL/USDT",
      timeframe: "1m",
      confidence: 78,
      status: "forming",
      detectedAt: new Date(Date.now() - 5 * 60 * 1000),
    },
    {
      id: "4",
      pattern: tradingPatterns.find(p => p.id === "bear-flag")!,
      symbol: "DOGE/USDT",
      timeframe: "1m",
      confidence: 68,
      entryPrice: 0.375,
      stopLoss: 0.385,
      takeProfit: 0.355,
      status: "forming",
      detectedAt: new Date(Date.now() - 12 * 60 * 1000),
    },
    {
      id: "5",
      pattern: tradingPatterns.find(p => p.id === "double-bottom")!,
      symbol: "BNB/USDT",
      timeframe: "15m",
      confidence: 65,
      status: "forming",
      detectedAt: new Date(Date.now() - 25 * 60 * 1000),
    },
  ];

  const confirmedSignals = livePatterns.filter(p => p.status === "confirmed");
  const formingSignals = livePatterns.filter(p => p.status === "forming");
  const bullishSignals = livePatterns.filter(p => p.pattern.direction === "bullish");
  const bearishSignals = livePatterns.filter(p => p.pattern.direction === "bearish");

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">AI Signals</h1>
          <Badge className="ml-2 bg-primary/15 text-primary border-primary/30">
            <Sparkles className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Real-time pattern detection powered by AI
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {livePatterns.map((livePattern) => (
              <LivePatternCard
                key={livePattern.id}
                livePattern={livePattern}
                onLearnMore={() => handleLearnMore(livePattern.pattern)}
              />
            ))}
          </div>
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
