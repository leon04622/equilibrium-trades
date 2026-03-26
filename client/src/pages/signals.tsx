import { useState, useEffect } from "react";
import { Zap, TrendingUp, TrendingDown, Clock, RefreshCw, AlertTriangle, Activity, Target, BookOpen, BarChart3, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ProSubscriptionRoute } from "@/components/protected-route";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";

interface PatternSignal {
  id: string;
  coin: string;
  timeframe: string;
  bias: "bullish" | "bearish" | "neutral";
  patternName: string;
  patternStatus: "forming" | "developed" | "breakout_watch";
  sma21: number;
  sma200: number;
  currentPrice: number;
  smaRelationship: string;
  educationalNote: string;
  whatToWatch: string;
  detectedAt: string;
}

function PatternCard({ signal }: { signal: PatternSignal }) {
  const isBullish = signal.bias === "bullish";
  const isBearish = signal.bias === "bearish";
  
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

  const getStatusBadge = () => {
    switch (signal.patternStatus) {
      case "forming":
        return <Badge className="bg-amber-500/80 text-white">Forming</Badge>;
      case "developed":
        return <Badge className="bg-blue-500/80 text-white">Developed</Badge>;
      case "breakout_watch":
        return <Badge className="bg-purple-500/80 text-white">Watch for Breakout</Badge>;
    }
  };

  const getBiasColor = () => {
    if (isBullish) return "border-green-500/30 bg-green-500/5";
    if (isBearish) return "border-red-500/30 bg-red-500/5";
    return "border-gray-500/30 bg-gray-500/5";
  };

  return (
    <Card className={cn("relative overflow-hidden transition-all", getBiasColor())}>
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full",
        isBullish ? "bg-green-500" : isBearish ? "bg-red-500" : "bg-gray-500"
      )} />
      
      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="text-base md:text-lg font-bold">{signal.coin}</span>
            <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0">
              {signal.timeframe}
            </Badge>
            {getStatusBadge()}
          </div>
          <div className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeSince(signal.detectedAt)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6 pb-3 md:pb-6">
        {/* Pattern Name & Bias */}
        <div className="flex items-center gap-2">
          {isBullish ? (
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-500 shrink-0" />
          ) : isBearish ? (
            <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-red-500 shrink-0" />
          ) : (
            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-gray-500 shrink-0" />
          )}
          <span className={cn(
            "font-semibold text-sm md:text-base truncate",
            isBullish ? "text-green-500" : isBearish ? "text-red-500" : "text-gray-500"
          )}>
            {signal.patternName}
          </span>
          <Badge variant="secondary" className="ml-auto text-[10px] md:text-xs shrink-0">
            {signal.bias.charAt(0).toUpperCase()} Bias
          </Badge>
        </div>

        {/* SMA Relationship - Educational */}
        <div className="p-2 md:p-3 rounded-lg bg-muted/50 border border-muted">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
            <Eye className="h-3 w-3 md:h-4 md:w-4 text-primary" />
            <span className="text-xs md:text-sm font-medium">SMA Analysis</span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">{signal.smaRelationship}</p>
        </div>
        
        {/* Current Market Data */}
        <div className="grid grid-cols-3 gap-2 md:gap-3 pt-2 border-t">
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">21 SMA</p>
            <p className="font-mono text-xs md:text-sm">${formatPrice(signal.sma21)}</p>
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">200 SMA</p>
            <p className="font-mono text-xs md:text-sm">${formatPrice(signal.sma200)}</p>
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Price</p>
            <p className="font-mono text-xs md:text-sm font-medium">${formatPrice(signal.currentPrice)}</p>
          </div>
        </div>
        
        {/* Educational Note - Collapsible on mobile */}
        <div className="p-2 md:p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
            <BookOpen className="h-3 w-3 md:h-4 md:w-4 text-primary" />
            <span className="text-xs md:text-sm font-medium text-primary">What This Means</span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">{signal.educationalNote}</p>
        </div>

        {/* What to Watch - Hidden on small mobile to save space */}
        <div className="p-2 md:p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 hidden sm:block">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-600">What to Watch</span>
          </div>
          <p className="text-sm text-muted-foreground">{signal.whatToWatch}</p>
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
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SignalsContent() {
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => [...SCAN_ALL_TIMEFRAMES]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const tfParam =
    selectedTimeframes.length > 0 ? selectedTimeframes.join(",") : [...SCAN_ALL_TIMEFRAMES].join(",");

  const { data: signals = [], isLoading, refetch, isFetching } = useQuery<PatternSignal[]>({
    queryKey: ["/api/signals/patterns", tfParam],
    queryFn: async () => {
      const response = await fetch(`/api/signals/patterns?timeframes=${encodeURIComponent(tfParam)}`);
      if (!response.ok) throw new Error("Failed to fetch patterns");
      return response.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isFetching) {
      setLastUpdate(new Date());
    }
  }, [isFetching]);

  const bullishSignals = signals.filter(s => s.bias === "bullish");
  const bearishSignals = signals.filter(s => s.bias === "bearish");
  const formingSignals = signals.filter(s => s.patternStatus === "forming");
  const developedSignals = signals.filter(s => s.patternStatus === "developed" || s.patternStatus === "breakout_watch");

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes(prev => 
      prev.includes(tf) 
        ? prev.filter(t => t !== tf)
        : [...prev, tf]
    );
  };

  const formatLastUpdate = () => {
    return lastUpdate.toLocaleTimeString();
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <h1 className="text-xl md:text-3xl font-display font-bold">Pattern Scanner</h1>
          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] md:text-xs">
            <BookOpen className="h-3 w-3 mr-1" />
            Educational
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs md:text-sm text-muted-foreground">
            Learn to identify patterns across timeframes
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:inline">
              Last: {formatLastUpdate()}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7 text-xs px-2"
              data-testid="button-refresh-signals"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", isFetching && "animate-spin")} />
              Scan
            </Button>
          </div>
        </div>
      </div>

      <Alert className="border-blue-500/50 bg-blue-500/5 hidden md:block">
        <BookOpen className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-600">Educational Tool</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          This scanner helps you <strong>learn pattern recognition</strong> by showing what's forming in the market. 
          Study the patterns, understand the bias, and practice identifying entry/exit points on your own. 
          <strong> We do not provide trade signals or financial advice.</strong>
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2 md:gap-3 flex-wrap">
        <span className="text-xs md:text-sm font-medium shrink-0">Timeframes:</span>
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {SCAN_ALL_TIMEFRAMES.map((tf) => (
            <Badge
              key={tf}
              variant={selectedTimeframes.includes(tf) ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all text-[10px] md:text-xs",
                selectedTimeframes.includes(tf) && "bg-primary"
              )}
              onClick={() => toggleTimeframe(tf)}
              data-testid={`badge-timeframe-${tf}`}
            >
              {tf}
            </Badge>
          ))}
        </div>
        <span className="text-[10px] md:text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">
          Full market scan every 60s (all selected TFs). Tap a badge to exclude a timeframe.
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/15 shrink-0">
                <Eye className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold">{signals.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">Patterns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-green-500/15 shrink-0">
                <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold">{bullishSignals.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">Bullish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-red-500/15 shrink-0">
                <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold">{bearishSignals.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">Bearish</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                <Clock className="h-4 w-4 md:h-5 md:w-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold">{formingSignals.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">Forming</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hide SMA explanation card on mobile - takes too much space */}
      <Card className="hidden md:block">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Understanding the 21/200 SMA Relationship
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/15 shrink-0">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-green-600">Bullish Bias</p>
                <p className="text-xs text-muted-foreground">
                  21 SMA above 200 SMA indicates buyers are in control. Look for continuation patterns.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 shrink-0">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-red-600">Bearish Bias</p>
                <p className="text-xs text-muted-foreground">
                  21 SMA below 200 SMA indicates sellers are in control. Look for breakdown patterns.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                <Target className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-amber-600">Pattern Confirmation</p>
                <p className="text-xs text-muted-foreground">
                  Wait for patterns to fully form before considering entries. Patience is key.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-3 md:space-y-4">
        <TabsList className="w-full overflow-x-auto flex justify-start gap-0 h-auto p-1">
          <TabsTrigger value="all" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-all-signals">
            All ({signals.length})
          </TabsTrigger>
          <TabsTrigger value="forming" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-forming-signals">
            Forming ({formingSignals.length})
          </TabsTrigger>
          <TabsTrigger value="developed" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-developed-signals">
            Developed ({developedSignals.length})
          </TabsTrigger>
          <TabsTrigger value="bullish" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-bullish-signals">
            Bullish ({bullishSignals.length})
          </TabsTrigger>
          <TabsTrigger value="bearish" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-bearish-signals">
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
                  <p className="text-lg font-medium">No Patterns Detected</p>
                  <p className="text-muted-foreground mb-4">
                    Markets are quiet - no clear patterns forming right now
                  </p>
                  <Button onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                    Scan Again
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signals.map(signal => (
                    <PatternCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="forming" className="space-y-4">
              {formingSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Patterns Forming</p>
                  <p className="text-muted-foreground">
                    Check back soon - patterns develop over time
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formingSignals.map(signal => (
                    <PatternCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="developed" className="space-y-4">
              {developedSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Developed Patterns</p>
                  <p className="text-muted-foreground">
                    Patterns are still forming - be patient
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {developedSignals.map(signal => (
                    <PatternCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bullish" className="space-y-4">
              {bullishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bullish Patterns</p>
                  <p className="text-muted-foreground">
                    No bullish setups detected currently
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bullishSignals.map(signal => (
                    <PatternCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bearish" className="space-y-4">
              {bearishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bearish Patterns</p>
                  <p className="text-muted-foreground">
                    No bearish setups detected currently
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bearishSignals.map(signal => (
                    <PatternCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">Not Financial Advice</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          This is an <strong>educational tool</strong> to help you learn pattern recognition. 
          We do not provide entry points, stop losses, or take profit levels. 
          You must learn to identify these yourself based on your own analysis and risk tolerance.
          Always practice on a demo account first.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default function Signals() {
  return (
    <ProSubscriptionRoute
      feature="ai_signals"
      title="Upgrade to Pro"
      description="Unlock Morning Star and AI pattern signals across all timeframes."
    >
      <SignalsContent />
    </ProSubscriptionRoute>
  );
}
