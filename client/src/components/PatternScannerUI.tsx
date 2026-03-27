import { useState, useEffect, useMemo, memo, useCallback, useRef } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  AlertTriangle,
  Activity,
  Target,
  BookOpen,
  BarChart3,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface PatternSignal {
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
  counterTrend?: boolean;
  volumeConfirmed?: boolean;
  marketBiasLabel?: string;
  apexEngineNote?: string;
  apexScanState?: "no_pattern" | "ranging" | "bull_flag" | "bear_flag";
  apexTier?: "high_probability_trend_aligned" | "standard" | "no_pattern_apex";
}

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
        return <Badge className="bg-purple-500/80 text-white">Watch for Breakout</Badge>;
    }
  };

  const getBiasColor = () => {
    if (isBullish) return "border-green-500/30 bg-green-500/5";
    if (isBearish) return "border-red-500/30 bg-red-500/5";
    return "border-gray-500/30 bg-gray-500/5";
  };

  const isHighProb = signal.apexTier === "high_probability_trend_aligned";
  const isApexFlag =
    signal.apexScanState === "bull_flag" || signal.apexScanState === "bear_flag";

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all",
        getBiasColor(),
        isHighProb && "ring-2 ring-violet-500/50 shadow-md shadow-violet-500/10",
      )}
    >
      <div
        className={cn(
          "absolute top-0 left-0 w-1 h-full",
          isBullish ? "bg-green-500" : isBearish ? "bg-red-500" : "bg-gray-500",
          isHighProb && "bg-violet-500 w-1.5",
        )}
      />

      <CardHeader className="pb-2 px-3 md:px-6 pt-3 md:pt-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
            <span className="text-base md:text-lg font-bold">{signal.coin}</span>
            <Badge variant="outline" className="text-[10px] md:text-xs px-1.5 py-0">
              {signal.timeframe}
            </Badge>
            {getStatusBadge()}
            {isHighProb && (
              <Badge className="bg-violet-600 text-white text-[10px] md:text-xs">High Prob · Trend</Badge>
            )}
            {isApexFlag && !isHighProb && (
              <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-600">
                Apex Flag
              </Badge>
            )}
            {signal.apexScanState === "ranging" && (
              <Badge variant="secondary" className="text-[10px]">
                Ranging
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeSince(signal.detectedAt)}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6 pb-3 md:pb-6">
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
          <div className="ml-auto flex flex-wrap gap-1 justify-end shrink-0">
            {signal.counterTrend && (
              <Badge variant="outline" className="text-[10px] md:text-xs border-amber-500/50 text-amber-600">
                Counter-Trend
              </Badge>
            )}
            {signal.volumeConfirmed && (
              <Badge variant="outline" className="text-[10px] md:text-xs border-emerald-500/40 text-emerald-600">
                Vol ✓
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] md:text-xs">
              {signal.bias.charAt(0).toUpperCase()} Bias
            </Badge>
          </div>
        </div>

        {signal.apexEngineNote && (
          <div className="p-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3 w-3 text-violet-600" />
              <span className="text-[10px] md:text-xs font-medium text-violet-700 dark:text-violet-400">
                Apex engine (pole + pivots)
              </span>
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">{signal.apexEngineNote}</p>
          </div>
        )}

        <div className="p-2 md:p-3 rounded-lg bg-muted/50 border border-muted">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
            <Eye className="h-3 w-3 md:h-4 md:w-4 text-primary" />
            <span className="text-xs md:text-sm font-medium">21 / 200 SMMA</span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
            {signal.smaRelationship}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-3 pt-2 border-t">
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

        <div className="p-2 md:p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
            <BookOpen className="h-3 w-3 md:h-4 md:w-4 text-primary" />
            <span className="text-xs md:text-sm font-medium text-primary">What This Means</span>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
            {signal.educationalNote}
          </p>
        </div>

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

type WatchlistApi = {
  allMarkets: boolean;
  coins: string[];
  mongoConfigured: boolean;
};

type PatternScanPayload = {
  patterns: PatternSignal[];
  meta: {
    coinCount: number;
    durationMs: number;
    signalCount: number;
    cached: boolean;
  };
};

function scannerAuthHeaders(wallet: string | null | undefined): HeadersInit {
  if (!wallet?.trim()) return {};
  return {
    "x-wallet-address": wallet.trim(),
    Authorization: `Bearer ${wallet.trim()}`,
  };
}

/** Institutional-style pattern scanner — Apex geometric engine, 30s refresh, MTF SMMA context. */
export function PatternScannerUI() {
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => [...SCAN_ALL_TIMEFRAMES]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [draftAllMarkets, setDraftAllMarkets] = useState(true);
  const [draftCoins, setDraftCoins] = useState<string[]>([]);
  const [tickerFilter, setTickerFilter] = useState("");

  const tfParam =
    selectedTimeframes.length > 0 ? selectedTimeframes.join(",") : [...SCAN_ALL_TIMEFRAMES].join(",");

  const { data: watchlistPref } = useQuery<WatchlistApi>({
    queryKey: ["/api/scanner/watchlist", address],
    enabled: !!address?.trim(),
    queryFn: async () => {
      const r = await fetch("/api/scanner/watchlist", { headers: scannerAuthHeaders(address) });
      if (!r.ok) throw new Error("Failed to load watchlist preferences");
      return r.json();
    },
  });

  const { data: marketsData } = useQuery<{ tickers: string[]; goldNote?: string }>({
    queryKey: ["/api/scanner/markets"],
    staleTime: 120_000,
    queryFn: async () => {
      const r = await fetch("/api/scanner/markets");
      if (!r.ok) throw new Error("Failed to load markets");
      return r.json();
    },
  });

  useEffect(() => {
    if (!watchlistPref) return;
    if (!watchlistPref.mongoConfigured) {
      setDraftAllMarkets(true);
      setDraftCoins([]);
      return;
    }
    setDraftAllMarkets(watchlistPref.allMarkets);
    setDraftCoins(watchlistPref.coins?.length ? [...watchlistPref.coins] : []);
  }, [watchlistPref]);

  const canCustomizeWatchlist = !!(address?.trim() && watchlistPref?.mongoConfigured);

  const watchlistScanKey = watchlistPref
    ? `${watchlistPref.allMarkets}:${[...(watchlistPref.coins || [])].sort().join(",")}`
    : `anon:${address ?? ""}`;

  const {
    data: scanPayload,
    isLoading,
    refetch,
    isFetching,
    isError,
    error,
  } = useQuery<PatternScanPayload>({
    queryKey: ["/api/signals/patterns", tfParam, address ?? "", watchlistScanKey],
    queryFn: async () => {
      const qs =
        `timeframes=${encodeURIComponent(tfParam)}` + (forceNocacheRef.current ? "&nocache=1" : "");
      forceNocacheRef.current = false;
      const response = await fetch(`/api/signals/patterns?${qs}`, {
        headers: scannerAuthHeaders(address),
      });
      if (!response.ok) throw new Error("Failed to fetch patterns");
      const meta = {
        coinCount: Number(response.headers.get("X-Pattern-Scan-Coins") || 0),
        durationMs: Number(response.headers.get("X-Pattern-Scan-Duration-Ms") || 0),
        signalCount: Number(response.headers.get("X-Pattern-Scan-Signals") || 0),
        cached: response.headers.get("X-Pattern-Scan-Cached") === "1",
      };
      const patterns = (await response.json()) as PatternSignal[];
      return { patterns, meta };
    },
    refetchInterval: (query) => (query.state.status === "error" ? false : 30_000),
    staleTime: 0,
    retry: 1,
  });

  const signals = isError ? [] : (scanPayload?.patterns ?? []);
  const scanMeta = isError ? null : (scanPayload?.meta ?? null);

  const saveWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!address?.trim()) throw new Error("Connect wallet to save watchlist");
      const r = await fetch("/api/scanner/watchlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...scannerAuthHeaders(address) },
        body: JSON.stringify({ allMarkets: draftAllMarkets, coins: draftCoins }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error || "Save failed");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/scanner/watchlist", address] });
      await queryClient.invalidateQueries({ queryKey: ["/api/signals/patterns"] });
      toast({ title: "Watchlist saved", description: "Your scanner market selection is stored on your user record." });
    },
    onError: (e: Error) =>
      toast({ title: "Could not save watchlist", description: e.message, variant: "destructive" }),
  });

  const toggleDraftCoin = useCallback((c: string) => {
    setDraftCoins((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }, []);

  const filteredTickers = useMemo(() => {
    const all = marketsData?.tickers ?? [];
    const q = tickerFilter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.toLowerCase().includes(q));
  }, [marketsData?.tickers, tickerFilter]);

  useEffect(() => {
    if (!isFetching) {
      setLastUpdate(new Date());
    }
  }, [isFetching]);

  const tabRows = useMemo(() => {
    const bullishSignals = signals.filter((s) => s.bias === "bullish");
    const bearishSignals = signals.filter((s) => s.bias === "bearish");
    const formingSignals = signals.filter((s) => s.patternStatus === "forming");
    const developedSignals = signals.filter(
      (s) => s.patternStatus === "developed" || s.patternStatus === "breakout_watch",
    );
    const highProb = signals.filter((s) => s.apexTier === "high_probability_trend_aligned");
    return {
      all: signals,
      bullishSignals,
      bearishSignals,
      formingSignals,
      developedSignals,
      highProb,
    };
  }, [signals]);

  const { bullishSignals, bearishSignals, formingSignals, developedSignals, highProb } = tabRows;

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf],
    );
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <h1 className="text-xl md:text-3xl font-display font-bold">Pattern Scanner</h1>
          <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px] md:text-xs">
            <Zap className="h-3 w-3 mr-1" />
            Apex Engine
          </Badge>
          <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] md:text-xs">
            <BookOpen className="h-3 w-3 mr-1" />
            Educational
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs md:text-sm text-muted-foreground">
            Impulse-validated flags (15-bar pole, pivot channel, ≤50% retrace) + 21/200 SMMA guards. MTF bundle 200 bars
            per TF.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:inline">
              Last: {lastUpdate.toLocaleTimeString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                forceNocacheRef.current = true;
                void refetch();
              }}
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

      {isError && (
        <Alert variant="destructive" className="border-red-500/50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Scan request failed</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              A full-universe pass can take several minutes; hosts often cut off around 60–120s. Results below are
              cleared so you are not looking at stale data from an older run. Try again with fewer timeframes, or ask
              ops to raise the HTTP timeout. {error instanceof Error ? error.message : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                forceNocacheRef.current = true;
                void refetch();
              }}
              disabled={isFetching}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert className="border-slate-500/40 bg-slate-500/5">
        <BarChart3 className="h-4 w-4 text-slate-600" />
        <AlertTitle className="text-slate-700 dark:text-slate-300">Why so few patterns?</AlertTitle>
        <AlertDescription className="text-muted-foreground text-xs sm:text-sm">
          We scan the whole Hyperliquid list, but each row needs roughly <strong>200 closed bars</strong> per timeframe,
          valid <strong>21/200 SMMA</strong>, and patterns that pass <strong>strict geometry + trend filters</strong> (Apex
          pole, flag rules, no hallucinated bull flags into bearish structure). Most pairs at any moment produce{" "}
          <strong>no qualifying label</strong> — that is expected, not a sign the universe scan is truncated.
          {scanMeta && scanMeta.coinCount > 0 ? (
            <>
              {" "}
              Your last successful response covered <strong>{scanMeta.coinCount}</strong> tickers
              {scanMeta.cached ? " (served from a short server cache)" : ""}.
            </>
          ) : null}
        </AlertDescription>
      </Alert>

      <Alert className="border-violet-500/40 bg-violet-500/5 hidden md:block">
        <Zap className="h-4 w-4 text-violet-600" />
        <AlertTitle className="text-violet-700 dark:text-violet-300">Geometric heuristic model</AlertTitle>
        <AlertDescription className="text-muted-foreground text-sm">
          Flags require a verified <strong>impulse pole</strong> (&gt;1.5% move, &gt;70% directional bodies). Consolidation
          uses <strong>pivot highs/lows</strong>; retracement cannot exceed <strong>50% of pole height</strong>.{" "}
          <strong>21 SMMA below 200 SMMA</strong> blocks bull-flag labels against macro structure (no hallucination).{" "}
          <strong>High Probability — Trend Aligned</strong> when 1m bull flag meets 15m bullish SMMA, or when 1h/4h Apex
          flags align with local 21/200.
        </AlertDescription>
      </Alert>

      <Alert className="border-blue-500/50 bg-blue-500/5 hidden md:block">
        <BookOpen className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-600">Educational Tool</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          This scanner helps you <strong>learn pattern recognition</strong>.{" "}
          <strong>We do not provide trade signals or financial advice.</strong>
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
                selectedTimeframes.includes(tf) && "bg-primary",
              )}
              onClick={() => toggleTimeframe(tf)}
              data-testid={`badge-timeframe-${tf}`}
            >
              {tf}
            </Badge>
          ))}
        </div>
        <span className="text-[10px] md:text-xs text-muted-foreground w-full sm:w-auto sm:ml-auto">
          Auto-refresh <strong>30s</strong> when healthy. Server pulls 200 candles per TF per coin (batched 5 tickers / 2s).
          Tap a TF to exclude it. Use <strong>Scan</strong> for a fresh pass (<code className="text-[9px]">nocache</code>
          ).
        </span>
      </div>

      {scanMeta && scanMeta.coinCount > 0 && !isError ? (
        <p className="text-[10px] md:text-xs text-muted-foreground font-mono px-0.5">
          Scan coverage: {scanMeta.coinCount} markets · {(scanMeta.durationMs / 1000).toFixed(1)}s server time ·{" "}
          {scanMeta.signalCount} labeled setups
          {scanMeta.cached ? " · cached (≤90s)" : ""}
        </p>
      ) : null}

      <Card className="border-border/80">
        <CardHeader className="pb-2 pt-4 px-4 md:px-6">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Markets &amp; watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm px-4 md:px-6 pb-4 md:pb-6">
          {marketsData?.goldNote ? (
            <p className="text-[10px] text-muted-foreground leading-snug">{marketsData.goldNote}</p>
          ) : null}
          {!address ? (
            <p className="text-xs text-muted-foreground">
              Wallet optional — the server scans <strong>all Hyperliquid perps plus active spot</strong> by default.
              Connect and enable Mongo to save an optional custom watchlist.
            </p>
          ) : !watchlistPref?.mongoConfigured ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              MongoDB is not connected — every run still uses the <strong>full HL universe</strong>. A custom ticker list
              and persistence require <code className="text-[10px]">MONGO_VAULT_URI</code>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Turn off &quot;All markets&quot; to scan only selected tickers (saved to your CRM user document).
            </p>
          )}

          {canCustomizeWatchlist ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Switch
                  id="scanner-all-markets"
                  checked={draftAllMarkets}
                  onCheckedChange={(v) => setDraftAllMarkets(v)}
                />
                <Label htmlFor="scanner-all-markets" className="text-xs font-medium cursor-pointer">
                  All markets (HL perps + active spot)
                </Label>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-fit text-xs"
                disabled={
                  saveWatchlistMutation.isPending || (!draftAllMarkets && draftCoins.length === 0)
                }
                onClick={() => saveWatchlistMutation.mutate()}
              >
                {saveWatchlistMutation.isPending ? "Saving…" : "Save watchlist"}
              </Button>
            </div>
          ) : null}

          {canCustomizeWatchlist && !draftAllMarkets ? (
            <div className="space-y-2">
              <Label className="text-xs">Tickers</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Filter tickers…"
                value={tickerFilter}
                onChange={(e) => setTickerFilter(e.target.value)}
              />
              <ScrollArea className="h-[min(200px,40vh)] rounded-md border p-2">
                <div className="space-y-2 pr-3">
                  {filteredTickers.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 text-xs font-mono cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                    >
                      <Checkbox
                        checked={draftCoins.includes(t)}
                        onCheckedChange={() => toggleDraftCoin(t)}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">{draftCoins.length} selected</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
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
        <Card className="bg-violet-500/5 border-violet-500/20">
          <CardContent className="p-2 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-violet-500/15 shrink-0">
                <Zap className="h-4 w-4 md:h-5 md:w-5 text-violet-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg md:text-2xl font-bold">{highProb.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">High prob</p>
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
        <Card className="bg-amber-500/5 border-amber-500/20 md:col-span-1 col-span-2">
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

      <Card className="hidden md:block">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            21 / 200 SMMA (trend-first)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/15 shrink-0">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-green-600">Bullish</p>
                <p className="text-xs text-muted-foreground">
                  21 SMMA above 200 SMMA — continuation patterns get priority when structure agrees.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 shrink-0">
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-red-600">Bearish</p>
                <p className="text-xs text-muted-foreground">
                  21 SMMA below 200 SMMA — bearish geometry only; bull flags are suppressed (no hallucination).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 shrink-0">
                <Target className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-sm text-amber-600">Confluence</p>
                <p className="text-xs text-muted-foreground">
                  1m setups can tag High Probability when 15m SMMA trend aligns. 1h/4h high-prob can alert Telegram.
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
          <TabsTrigger
            value="bullish"
            className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5"
            data-testid="tab-bullish-signals"
          >
            Bullish ({bullishSignals.length})
          </TabsTrigger>
          <TabsTrigger
            value="bearish"
            className="text-[10px] md:text-sm px-2 md:px-3 py-1 md:py-1.5"
            data-testid="tab-bearish-signals"
          >
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
                  <p className="text-muted-foreground mb-4">Apex found no qualifying structures on selected TFs.</p>
                  <Button
                    onClick={() => {
                      forceNocacheRef.current = true;
                      void refetch();
                    }}
                    disabled={isFetching}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
                    Scan Again
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
                  <p className="text-lg font-medium">No Patterns Forming</p>
                  <p className="text-muted-foreground">Check back soon — patterns develop over time.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {formingSignals.map((signal) => (
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
                  <p className="text-muted-foreground">Patterns are still forming — be patient.</p>
                </div>
              ) : (
                <PatternGrid items={tabRows.developedSignals} />
              )}
            </TabsContent>

            <TabsContent value="bullish" className="space-y-4">
              {bullishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bullish Patterns</p>
                  <p className="text-muted-foreground">No bullish setups detected currently.</p>
                </div>
              ) : (
                <PatternGrid items={tabRows.bullishSignals} />
              )}
            </TabsContent>

            <TabsContent value="bearish" className="space-y-4">
              {bearishSignals.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No Bearish Patterns</p>
                  <p className="text-muted-foreground">No bearish setups detected currently.</p>
                </div>
              ) : (
                <PatternGrid items={tabRows.bearishSignals} />
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-600">Not Financial Advice</AlertTitle>
        <AlertDescription className="text-muted-foreground">
          Educational only. Always practice risk management and use a demo account first.
        </AlertDescription>
      </Alert>
    </div>
  );
}
