import { memo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  AlertTriangle,
  Activity,
  BarChart3,
  Target,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface PatternSignal {
  id: string;
  coin: string;
  /** Human-readable market name when `coin` is a spot `@index` id from the venue API. */
  coinDisplay?: string;
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
  counterTrend?: boolean;
  volumeConfirmed?: boolean;
  marketBiasLabel?: string;
  apexEngineNote?: string;
  apexScanState?: "no_pattern" | "ranging" | "bull_flag" | "bear_flag";
  apexTier?: "high_probability_trend_aligned" | "standard" | "no_pattern_apex";
}

export type PatternScanSource = "query" | "watchlist" | "universe" | "top_volume";

export type PatternScanSummaryMeta = {
  coinCount: number;
  durationMs: number;
  signalCount: number;
  cached: boolean;
  source: PatternScanSource;
  coinsPreview: string;
  volumeCapMax: number | null;
};

const PatternCard = memo(function PatternCard({ signal }: { signal: PatternSignal }) {
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
        return <Badge className="bg-blue-500/80 text-white">Developed</Badge>;
    }
  };

  const getBiasColor = () => {
    if (isBullish) return "border-green-500/30 bg-green-500/5";
    if (isBearish) return "border-red-500/30 bg-red-500/5";
    return "border-gray-500/30 bg-gray-500/5";
  };

  return (
    <Card className={cn("relative overflow-hidden transition-all", getBiasColor())}>
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full",
          isBullish ? "bg-green-500" : isBearish ? "bg-red-500" : "bg-gray-500",
        )}
      />

      <CardContent className="space-y-3 pt-4 px-3 md:px-6 pb-4 md:pb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
            <span
              className="text-base md:text-lg font-bold truncate max-w-[min(100%,14rem)] sm:max-w-none"
              title={signal.coin}
            >
              {signal.coinDisplay ?? signal.coin}
            </span>
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

        <div className="flex items-center gap-2">
          {isBullish ? (
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-500 shrink-0" />
          ) : isBearish ? (
            <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-red-500 shrink-0" />
          ) : (
            <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-gray-500 shrink-0" />
          )}
          <span
            className={cn(
              "font-semibold text-sm md:text-base truncate",
              isBullish ? "text-green-500" : isBearish ? "text-red-500" : "text-gray-500",
            )}
          >
            {signal.patternName}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-3 pt-1 border-t">
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">21 SMMA</p>
            <p className="font-mono text-xs md:text-sm">${formatPrice(signal.sma21)}</p>
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">200 SMMA</p>
            <p className="font-mono text-xs md:text-sm">${formatPrice(signal.sma200)}</p>
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Price</p>
            <p className="font-mono text-xs md:text-sm font-medium">${formatPrice(signal.currentPrice)}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-3">{signal.educationalNote}</p>
      </CardContent>
    </Card>
  );
});

const PatternGrid = memo(function PatternGrid({ items }: { items: PatternSignal[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((signal) => (
        <PatternCard key={signal.id} signal={signal} />
      ))}
    </div>
  );
});

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="pt-4 space-y-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export type PatternTabRows = {
  all: PatternSignal[];
  formingSignals: PatternSignal[];
  developedSignals: PatternSignal[];
};

export interface PatternResultsProps {
  signals: PatternSignal[];
  tabRows: PatternTabRows;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  scanMeta: PatternScanSummaryMeta | null;
  scanHasCompleted: boolean;
  refetchAll: () => Promise<void>;
  /** Shown in loading / empty copy, e.g. "all timeframes" or "15m only". */
  timeframeScopeLabel?: string;
  /** User filtered to a single short TF (e.g. 1m only) — explain why empty passes are normal. */
  singleFastTimeframeOnly?: boolean;
  activeTab?: "all" | "forming" | "developed";
  onActiveTabChange?: (tab: "all" | "forming" | "developed") => void;
}

export function PatternResults({
  signals,
  tabRows,
  isLoading,
  isFetching,
  isError,
  error,
  scanMeta,
  scanHasCompleted,
  refetchAll,
  timeframeScopeLabel = "all timeframes",
  singleFastTimeframeOnly = false,
  activeTab = "all",
  onActiveTabChange,
}: PatternResultsProps) {
  const { formingSignals, developedSignals } = tabRows;

  return (
    <>
      {isError && (
        <Alert variant="destructive" className="border-red-500/50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Scan request failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Scanning every listed market ({timeframeScopeLabel}) can take a while; the request may time out on
              some hosts. Try again or ask ops to raise the HTTP timeout.{" "}
              {error instanceof Error ? error.message : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                void refetchAll();
              }}
              disabled={isFetching}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!isError && scanMeta?.volumeCapMax != null ? (
        <Alert className="border-orange-500/45 bg-orange-500/[0.07]">
          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
          <AlertTitle className="text-orange-900 dark:text-orange-100">Server coin cap</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm text-muted-foreground">
            <code className="text-[10px]">PATTERN_SCAN_ENFORCE_MAX_COINS</code> is limiting how many markets are scanned.
            Unset it for the full universe (unless you need a smaller run for performance).
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-2 md:p-4">
            <p className="text-lg md:text-2xl font-bold">{signals.length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">All</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-2 md:p-4">
            <p className="text-lg md:text-2xl font-bold">{formingSignals.length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">Forming</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-2 md:p-4">
            <p className="text-lg md:text-2xl font-bold">{developedSignals.length}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">Developed</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          if (tab === "all" || tab === "forming" || tab === "developed") {
            onActiveTabChange?.(tab);
          }
        }}
        className="space-y-3 md:space-y-4"
      >
        <TabsList className="w-full overflow-x-auto flex justify-start gap-0 h-auto p-1">
          <TabsTrigger value="all" className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5" data-testid="tab-all-signals">
            All ({signals.length})
          </TabsTrigger>
          <TabsTrigger
            value="forming"
            className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5"
            data-testid="tab-forming-signals"
          >
            Forming ({formingSignals.length})
          </TabsTrigger>
          <TabsTrigger
            value="developed"
            className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5"
            data-testid="tab-developed-signals"
          >
            Developed ({developedSignals.length})
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
                  <p className="text-lg font-medium">No patterns yet</p>
                  <p className="text-muted-foreground mb-2">
                    {scanHasCompleted
                      ? `No setups on ${timeframeScopeLabel} for this pass — try another timeframe or scan again.`
                      : `Scanner is updating (${timeframeScopeLabel}).`}
                  </p>
                  {scanHasCompleted && singleFastTimeframeOnly ? (
                    <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto leading-relaxed">
                      This is often expected on <strong>1m</strong>: patterns need a clear pole, consolidation, or triangle
                      geometry. Use <strong>All TF</strong> or <strong>15m+</strong> if you want the same rules applied
                      across slower bars (usually more structure).
                    </p>
                  ) : null}
                  <Button
                    className="mt-2"
                    onClick={() => {
                      void refetchAll();
                    }}
                    disabled={isFetching}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                    Scan again
                  </Button>
                </div>
              ) : (
                <PatternGrid items={tabRows.all} />
              )}
            </TabsContent>

            <TabsContent value="forming" className="space-y-4">
              {formingSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Nothing forming</p>
                  <p className="text-muted-foreground">Check back on the next poll.</p>
                </div>
              ) : (
                <PatternGrid items={formingSignals} />
              )}
            </TabsContent>

            <TabsContent value="developed" className="space-y-4">
              {developedSignals.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Nothing developed</p>
                  <p className="text-muted-foreground">Developed includes mature setups and confirmed breakouts on this pass.</p>
                </div>
              ) : (
                <PatternGrid items={developedSignals} />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">Not financial advice</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          For learning only. Manage risk and use a demo where appropriate.
        </AlertDescription>
      </Alert>
    </>
  );
}
