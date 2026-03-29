import { useState, useEffect, useMemo, useRef } from "react";
import { Zap, RefreshCw, Activity, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { SCAN_ALL_TIMEFRAMES } from "@shared/scan-timeframes";
import { useWallet } from "@/lib/wallet-context";
import {
  PatternResults,
  type PatternSignal,
  type PatternScanSource,
} from "@/components/PatternResults";

export type { PatternSignal };

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

const ALL_TF_LIST = [...SCAN_ALL_TIMEFRAMES];

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

/** Fast-track 1m/3m/5m vs slower HTF polling — merged view; geometry unfiltered, SMMA context on cards only. */
export function PatternScannerUI() {
  const { address } = useWallet();
  const forceNocacheRef = useRef(false);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(() => [...ALL_TF_LIST]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const scanHydratedRef = useRef(false);
  const prev1mIdsRef = useRef<Set<string>>(new Set());

  const fastTfParam = useMemo(() => {
    const sel = selectedTimeframes.length > 0 ? selectedTimeframes : ALL_TF_LIST;
    const xs = sel.filter((tf) => (FAST_TRACK_TFS as readonly string[]).includes(tf));
    return xs.length > 0 ? xs.join(",") : "";
  }, [selectedTimeframes]);

  const slowTfParam = useMemo(() => {
    const sel = selectedTimeframes.length > 0 ? selectedTimeframes : ALL_TF_LIST;
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
            Server scans the <strong>top 50 Hyperliquid perps by 24h volume</strong> plus <strong>PAXG</strong> (gold on
            HL). Full library (flags, triangles, doubles, wedges, H&amp;S, Apex) on <strong>1m–1d</strong> when selected.
            Fast <strong>1m / 3m / 5m</strong> ~<strong>20s</strong>; slower TFs ~<strong>3m</strong>. Chart SMMA lines are
            unchanged — scanner does not hide patterns by trend.
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

      <PatternResults
        signals={signals}
        tabRows={tabRows}
        isLoading={isLoading}
        isFetching={isFetching}
        hasScanData={hasScanData}
        isError={isError}
        error={error}
        scanMeta={scanMeta}
        scanHasCompleted={scanHasCompleted}
        uniqueCoinsInSignals={uniqueCoinsInSignals}
        selectedTimeframes={selectedTimeframes}
        toggleTimeframe={toggleTimeframe}
        refetchAll={refetchAll}
      />
    </div>
  );
}
