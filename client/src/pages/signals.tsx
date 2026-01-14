import { useState } from "react";
import { Zap, TrendingUp, TrendingDown, Clock, RefreshCw, AlertTriangle, Activity, Target, ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface CrossoverSignal {
  id: string;
  coin: string;
  type: "bullish_crossover" | "bearish_crossover" | "bullish_setup" | "bearish_setup";
  status: "forming" | "confirmed" | "active";
  timeframe: string;
  sma21: number;
  sma200: number;
  currentPrice: number;
  entryPrice: number;
  suggestedSL: number;
  suggestedTP: number;
  confidence: number;
  detectedAt: string;
  description: string;
  patternType?: string;
}

function SignalCard({ signal }: { signal: CrossoverSignal }) {
  const isBullish = signal.type.includes("bullish");
  const isConfirmed = signal.status === "confirmed";
  const isForming = signal.status === "forming";
  
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  const timeSince = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all hover:shadow-lg",
      isBullish ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
    )}>
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full",
        isBullish ? "bg-green-500" : "bg-red-500"
      )} />
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{signal.coin}</span>
            <Badge variant="outline" className="text-xs">
              {signal.timeframe}
            </Badge>
            <Badge 
              className={cn(
                "text-xs",
                isConfirmed 
                  ? isBullish ? "bg-green-500" : "bg-red-500"
                  : isForming 
                    ? "bg-amber-500" 
                    : isBullish ? "bg-green-500/70" : "bg-red-500/70"
              )}
            >
              {isConfirmed ? "Confirmed" : isForming ? "Forming" : "Active Setup"}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeSince(signal.detectedAt)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {isBullish ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
          <span className={cn(
            "font-medium",
            isBullish ? "text-green-500" : "text-red-500"
          )}>
            {signal.type === "bullish_crossover" && "Bullish Crossover"}
            {signal.type === "bearish_crossover" && "Bearish Crossover"}
            {signal.type === "bullish_setup" && "Bullish Setup"}
            {signal.type === "bearish_setup" && "Bearish Setup"}
          </span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {signal.confidence}% confidence
          </Badge>
        </div>
        
        <p className="text-sm text-muted-foreground">{signal.description}</p>
        
        {signal.patternType && (
          <div className="flex items-center gap-2 text-xs">
            <Target className="h-3 w-3" />
            <span>Look for: {signal.patternType}</span>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">21 SMA</p>
            <p className="font-mono text-sm">${formatPrice(signal.sma21)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">200 SMA</p>
            <p className="font-mono text-sm">${formatPrice(signal.sma200)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Entry</p>
            <p className="font-mono text-sm font-medium">${formatPrice(signal.entryPrice)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="font-mono text-sm">${formatPrice(signal.currentPrice)}</p>
          </div>
        </div>
        
        <div className="flex gap-3 pt-2 border-t">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Stop Loss</p>
            <p className="font-mono text-sm text-red-400">${formatPrice(signal.suggestedSL)}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Take Profit</p>
            <p className="font-mono text-sm text-green-400">${formatPrice(signal.suggestedTP)}</p>
          </div>
        </div>
        
        <div className="pt-2">
          <Link href={`/trading?coin=${signal.coin}`}>
            <Button 
              className={cn(
                "w-full",
                isBullish ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
              )}
              data-testid={`button-trade-${signal.id}`}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Trade {signal.coin}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Signals() {
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["1m", "5m", "15m"]);

  const { data: signals = [], isLoading, refetch, isFetching } = useQuery<CrossoverSignal[]>({
    queryKey: ["/api/signals/crossover", selectedTimeframes.join(",")],
    queryFn: async () => {
      const response = await fetch(`/api/signals/crossover?timeframes=${selectedTimeframes.join(",")}`);
      if (!response.ok) throw new Error("Failed to fetch signals");
      return response.json();
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const bullishSignals = signals.filter(s => s.type.includes("bullish"));
  const bearishSignals = signals.filter(s => s.type.includes("bearish"));
  const confirmedSignals = signals.filter(s => s.status === "confirmed");
  const formingSignals = signals.filter(s => s.status === "forming");

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes(prev => 
      prev.includes(tf) 
        ? prev.filter(t => t !== tf)
        : [...prev, tf]
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">AI Signals</h1>
          <Badge className="ml-2 bg-primary/15 text-primary border-primary/30">
            <Zap className="h-3 w-3 mr-1" />
            21/200 SMA Strategy
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="ml-auto"
            disabled={isFetching}
            data-testid="button-refresh-signals"
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} />
            Scan Markets
          </Button>
        </div>
        <p className="text-muted-foreground">
          Real-time SMA crossover detection based on the cryptolifer.com strategy
        </p>
      </div>

      <Alert className="border-primary/50 bg-primary/5">
        <Activity className="h-4 w-4" />
        <AlertTitle>How This Works</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Signals are shown <strong>only when patterns are actively forming or confirmed</strong>. 
          We scan for 21 SMA crossing 200 SMA crossovers and continuation setups. 
          Confirmed crossovers have 85%+ confidence, forming patterns 65%+, and active setups 75%+.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium">Timeframes:</span>
        {["1m", "5m", "15m", "1h", "4h"].map(tf => (
          <Badge 
            key={tf}
            variant={selectedTimeframes.includes(tf) ? "default" : "outline"}
            className={cn(
              "cursor-pointer transition-all",
              selectedTimeframes.includes(tf) && "bg-primary"
            )}
            onClick={() => toggleTimeframe(tf)}
            data-testid={`badge-timeframe-${tf}`}
          >
            {tf}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{signals.length}</p>
                <p className="text-xs text-muted-foreground">Active Signals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/15">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bullishSignals.length}</p>
                <p className="text-xs text-muted-foreground">Bullish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15">
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bearishSignals.length}</p>
                <p className="text-xs text-muted-foreground">Bearish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
                <Clock className="h-5 w-5 text-amber-500" />
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
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            The 21/200 SMA Crossover Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/15 text-green-500 font-bold shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-sm">Watch for Crossover</p>
                <p className="text-xs text-muted-foreground">
                  21 SMA crossing above 200 SMA = bullish. Crossing below = bearish.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-sm">Confirm on Higher TF</p>
                <p className="text-xs text-muted-foreground">
                  Check 5m chart - price should be above 200 SMA for longs, below for shorts.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500 font-bold shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-sm">Look for Patterns</p>
                <p className="text-xs text-muted-foreground">
                  Bull flags, triangles, or pennants after crossover for entry confirmation.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-signals">
            All Signals ({signals.length})
          </TabsTrigger>
          <TabsTrigger value="confirmed" data-testid="tab-confirmed-signals">
            Confirmed ({confirmedSignals.length})
          </TabsTrigger>
          <TabsTrigger value="forming" data-testid="tab-forming-signals">
            Forming ({formingSignals.length})
          </TabsTrigger>
          <TabsTrigger value="bullish" data-testid="tab-bullish-signals">
            Bullish ({bullishSignals.length})
          </TabsTrigger>
          <TabsTrigger value="bearish" data-testid="tab-bearish-signals">
            Bearish ({bearishSignals.length})
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            <TabsContent value="all" className="space-y-4">
              {signals.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Active Signals</p>
                  <p className="text-muted-foreground mb-4">
                    Markets are quiet - no SMA crossovers or setups detected right now
                  </p>
                  <Button onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                    Scan Again
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signals.map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="confirmed" className="space-y-4">
              {confirmedSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Confirmed Crossovers</p>
                  <p className="text-muted-foreground">
                    No 21/200 SMA crossovers have been confirmed recently
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {confirmedSignals.map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="forming" className="space-y-4">
              {formingSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Forming Patterns</p>
                  <p className="text-muted-foreground">
                    No crossovers are currently forming
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formingSignals.map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bullish" className="space-y-4">
              {bullishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bullish Signals</p>
                  <p className="text-muted-foreground">
                    No bullish crossovers or setups detected
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bullishSignals.map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bearish" className="space-y-4">
              {bearishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bearish Signals</p>
                  <p className="text-muted-foreground">
                    No bearish crossovers or setups detected
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bearishSignals.map(signal => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">Risk Warning</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          These signals are for educational purposes. Always verify on the chart before trading. 
          Past performance does not guarantee future results. Never risk more than you can afford to lose.
        </AlertDescription>
      </Alert>
    </div>
  );
}
