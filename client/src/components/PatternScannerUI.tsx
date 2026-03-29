import { useState, useEffect, useMemo, memo, useRef } from "react";
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
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";
import { useWallet } from "@/lib/wallet-context";

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

type PatternScanSource = "query" | "watchlist" | "universe" | "top_volume";

type PatternScanPayload = {
  patterns: PatternSignal[];
  meta: {
    coinCount: number;
    durationMs: number;
    signalCount: number;
    cached: boolean;
    source: PatternScanSource;
    coinsPreview: string;
    volumeCapMax: number | null;
  };
};

function scannerAuthHeaders(wallet: string | null | undefined): HeadersInit {
  if (!wallet?.trim()) return {};
  return {
    "x-wallet-address": wallet.trim(),
    Authorization: `Bearer ${wallet.trim()}`,
  };
}

const FAST_TRACK_TFS = ["1m", "3m", "5m"] as const;

function playSetupChime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.07, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.22);
  } catch {
    /* ignore */
  }
}

async function fetchPatternScanPayload(
  timeframes: string,
  wallet: string | null | undefined,
  nocache: boolean,
): Promise<PatternScanPayload> {
  const qs = `timeframes=${encodeURIComponent(timeframes)}` + (nocache ? "&nocache=1" : "");
  const response = await fetch(`/api/signals/patterns?${qs}`, {
    headers: scannerAuthHeaders(wallet),
  });
  if (!response.ok) throw new Error("Failed to fetch patterns");
  const srcRaw = (response.headers.get("X-Pattern-Scan-Source") || "top_volume").trim();
  const source: PatternScanSource =
    srcRaw === "query" || srcRaw === "watchlist" || srcRaw === "universe" || srcRaw === "top_volume"
      ? srcRaw
      : "top_volume";
  const capHdr = response.headers.get("X-Pattern-Scan-Volume-Cap");
  const capN = capHdr != null && capHdr !== "" ? Number(capHdr) : NaN;
  const meta = {
    coinCount: Number(response.headers.get("X-Pattern-Scan-Coins") || 0),
    durationMs: Number(response.headers.get("X-Pattern-Scan-Duration-Ms") || 0),
    signalCount: Number(response.headers.get("X-Pattern-Scan-Signals") || 0),
    cached: response.headers.get("X-Pattern-Scan-Cached") === "1",
    source,
    coinsPreview: (response.headers.get("X-Pattern-Scan-Coins-Preview") || "").trim(),
    volumeCapMax: Number.isFinite(capN) && capN > 0 ? capN : null,
  };
  const patterns = (await response.json()) as PatternSignal[];
  return { patterns, meta };
}

/** Fast-track 1m/3m/5m vs slower HTF polling — merged view, Apex engine, SMMA guards unchanged. */
export function PatternScannerUI() {
  const { address } = useWallet();
  const forceNocacheRef = useRef(false);
  /** Default skips 1d to reduce request latency; user can enable 1d from badges. */
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() =>
    SCAN_ALL_TIMEFRAMES.filter((tf) => tf !== "1d"),
  );
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const scanHydratedRef = useRef(false);
  const prev1mIdsRef = useRef<Set<string>>(new Set());

  const fastTfParam = useMemo(() => {
    const sel =
      selectedTimeframes.length > 0 ? selectedTimeframes : SCAN_ALL_TIMEFRAMES.filter((tf) => tf !== "1d");
    const xs = sel.filter((tf) => (FAST_TRACK_TFS as readonly string[]).includes(tf));
    return xs.length > 0 ? xs.join(",") : "";
  }, [selectedTimeframes]);

  const slowTfParam = useMemo(() => {
    const sel =
      selectedTimeframes.length > 0 ? selectedTimeframes : SCAN_ALL_TIMEFRAMES.filter((tf) => tf !== "1d");
    const xs = sel.filter((tf) => !(FAST_TRACK_TFS as readonly string[]).includes(tf));
    return xs.length > 0 ? xs.join(",") : "";
  }, [selectedTimeframes]);

  const fastQuery = useQuery<PatternScanPayload>({
    queryKey: ["/api/signals/patterns", "fast", fastTfParam, address ?? ""],
    enabled: fastTfParam.length > 0,
    queryFn: () =>
      fetchPatternScanPayload(fastTfParam, address, forceNocacheRef.current),
    refetchInterval: (q) =>
      q.state.status === "error" || !fastTfParam ? false : 20_000,
    staleTime: 12_000,
    retry: 1,
  });

  const slowQuery = useQuery<PatternScanPayload>({
    queryKey: ["/api/signals/patterns", "slow", slowTfParam, address ?? ""],
    enabled: slowTfParam.length > 0,
    queryFn: () =>
      fetchPatternScanPayload(slowTfParam, address, forceNocacheRef.current),
    refetchInterval: (q) =>
      q.state.status === "error" || !slowTfParam ? false : 180_000,
    staleTime: 120_000,
    retry: 1,
  });

  const hasScanData = !!(fastQuery.data || slowQuery.data);

  const refetchAll = async () => {
    forceNocacheRef.current = true;
    try {
      const ps: Promise<unknown>[] = [];
      if (fastTfParam) ps.push(fastQuery.refetch());
      if (slowTfParam) ps.push(slowQuery.refetch());
      await Promise.all(ps);
    } finally {
      forceNocacheRef.current = false;
    }
  };

  const isError = useMemo(() => {
    const fDead = !!fastTfParam && fastQuery.isError && !fastQuery.data;
    const sDead = !!slowTfParam && slowQuery.isError && !slowQuery.data;
    if (!fastTfParam && !slowTfParam) return false;
    if (fastTfParam && slowTfParam) return fDead && sDead;
    if (fastTfParam) return fDead;
    return sDead;
  }, [fastTfParam, slowTfParam, fastQuery.isError, fastQuery.data, slowQuery.isError, slowQuery.data]);

  const error = fastQuery.error ?? slowQuery.error;

  const isLoading =
    (!!fastTfParam && fastQuery.isPending && !fastQuery.data) ||
    (!!slowTfParam && slowQuery.isPending && !slowQuery.data);

  const isFetching =
    (!!fastTfParam && fastQuery.isFetching) || (!!slowTfParam && slowQuery.isFetching);

  const signals = useMemo(() => {
    if (isError) return [];
    const map = new Map<string, PatternSignal>();
    const dedupeKey = (p: PatternSignal) => `${p.coin}|${p.timeframe}|${p.patternName}`;
    for (const p of fastQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    for (const p of slowQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    return [...map.values()].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  }, [isError, fastQuery.data, slowQuery.data]);

  const scanMeta = useMemo(() => {
    if (isError) return null;
    const parts = [fastQuery.data?.meta, slowQuery.data?.meta].filter(Boolean) as PatternScanPayload["meta"][];
    if (parts.length === 0) return null;
    return {
      coinCount: Math.max(...parts.map((p) => p.coinCount)),
      durationMs: parts.reduce((s, p) => s + p.durationMs, 0),
      signalCount: signals.length,
      cached: parts.every((p) => p.cached),
      source: parts[0]!.source,
      coinsPreview: parts[0]!.coinsPreview || parts[1]?.coinsPreview || "",
      volumeCapMax: parts[0]!.volumeCapMax ?? parts[1]?.volumeCapMax ?? null,
    };
  }, [isError, fastQuery.data, slowQuery.data, signals.length]);

  const scanHasCompleted = !isError && !!scanMeta && scanMeta.coinCount > 0;
  const uniqueCoinsInSignals = useMemo(() => new Set(signals.map((s) => s.coin)), [signals]);

  useEffect(() => {
    if (!isFetching) {
      setLastUpdate(new Date());
    }
  }, [isFetching]);

  useEffect(() => {
    if (isError || isLoading) return;
    const nowIds = new Set(signals.filter((s) => s.timeframe === "1m").map((s) => s.id));
    if (!scanHydratedRef.current) {
      scanHydratedRef.current = true;
      prev1mIdsRef.current = nowIds;
      return;
    }
    for (const id of nowIds) {
      if (!prev1mIdsRef.current.has(id)) playSetupChime();
    }
    prev1mIdsRef.current = nowIds;
  }, [signals, isError, isLoading]);

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
            Server scans the <strong>top 50 Hyperliquid perps by 24h volume</strong> plus <strong>PAXG</strong> (gold proxy on
            HL). Fast-track <strong>1m / 3m / 5m</strong> refresh about every <strong>20s</strong>; higher timeframes about
            every <strong>3 minutes</strong>. Apex uses aggressive geometry on short TFs; 21/200 SMMA guards unchanged.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] md:text-xs text-muted-foreground hidden sm:inline">
              Last: {lastUpdate.toLocaleTimeString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchAll();
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
              The scan runs ~50 high-volume markets × your selected timeframes; hosts often cut off around 60–120s.
              Results below are cleared so you are not looking at stale data. Try fewer timeframes (1d is off by
              default) or ask ops to raise the HTTP timeout. {error instanceof Error ? error.message : ""}
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
          <AlertTitle className="text-orange-900 dark:text-orange-100">Server volume cap</AlertTitle>
          <AlertDescription className="text-xs sm:text-sm text-muted-foreground">
            Host enforced a volume cap; the server raises any value below <strong>50</strong> to match the global
            scanner minimum (top volume + PAXG). Unset <code className="text-[10px]">PATTERN_SCAN_ENFORCE_MAX_COINS</code>{" "}
            if you want the full API-driven list without a ceiling.
          </AlertDescription>
        </Alert>
      ) : null}

      {!isError ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 space-y-1.5 transition-colors",
            isLoading && !hasScanData
              ? "border-primary/35 bg-primary/5"
              : signals.length > 0
                ? "border-emerald-500/35 bg-emerald-500/[0.06]"
                : scanHasCompleted
                  ? "border-border bg-muted/25"
                  : "border-border/80 bg-card/40",
          )}
        >
          {isFetching && hasScanData ? (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden />
              Updating scan…
            </p>
          ) : null}
          {isLoading && !hasScanData ? (
            <p className="text-sm flex items-center gap-2 text-foreground">
              <RefreshCw className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden />
              Scanning top volume markets and selected timeframes…
            </p>
          ) : scanHasCompleted ? (
            <>
              <div className="flex items-start gap-2">
                {signals.length > 0 ? (
                  <CheckCircle2
                    className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                    aria-hidden
                  />
                ) : (
                  <Activity className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    {signals.length > 0 ? (
                      <>
                        Scanner found <strong>{signals.length}</strong> labeled setup
                        {signals.length === 1 ? "" : "s"} matching the current rules.
                      </>
                    ) : (
                      <>
                        Scanning <strong>50+</strong> markets — seeking high-probability setups. Nothing matched on this
                        pass; fast-track lanes keep polling.
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This run evaluated <strong>{scanMeta!.coinCount}</strong> market
                    {scanMeta!.coinCount === 1 ? "" : "s"} in {(scanMeta!.durationMs / 1000).toFixed(1)}s
                    {scanMeta!.cached ? " (recent cached result)" : ""}.
                    {signals.length === 0
                      ? " The engine now uses aggressive short-TF geometry; new 1m labels surface immediately with an audio ping."
                      : null}
                  </p>
                  {(scanMeta!.source === "universe" || scanMeta!.source === "top_volume") &&
                  scanMeta!.coinsPreview ? (
                    <p className="text-[10px] font-mono text-muted-foreground/90 break-all pt-0.5">
                      Tickers in this run (sample): {scanMeta!.coinsPreview}
                    </p>
                  ) : null}
                  {signals.length > 0 &&
                  (scanMeta!.source === "universe" || scanMeta!.source === "top_volume") &&
                  uniqueCoinsInSignals.size === 1 &&
                  scanMeta!.coinCount > 15 ? (
                    <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">
                      All visible cards are for <strong>{Array.from(uniqueCoinsInSignals)[0]}</strong> right now — other
                      markets in this run were checked but did not get a qualifying label on this pass (filters are
                      strict, not broken).
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Waiting for scan to start…</p>
          )}
        </div>
      ) : null}

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
          <strong>1m–5m</strong> ~<strong>20s</strong> · slower TFs ~<strong>3m</strong>. 200+ candles per TF; wider
          parallel batches. Tap a TF to exclude (1d off by default). <strong>Scan</strong> = fresh pass (both lanes).
        </span>
      </div>

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
                  <p className="text-lg font-medium">Scanning 50+ Markets…</p>
                  <p className="text-muted-foreground mb-4">Seeking high-probability setups across fast-track timeframes.</p>
                  <Button
                    onClick={() => {
                      void refetchAll();
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
