import { useState, useEffect, useMemo, useRef } from "react";
import { RefreshCw, Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { SCAN_ALL_TIMEFRAMES, type ScanTimeframe } from "@shared/scan-timeframes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWallet } from "@/lib/wallet-context";
import {
  PatternResults,
  type PatternSignal,
  type PatternScanSource,
} from "@/components/PatternResults";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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

type ScannerTfSelection = "all" | ScanTimeframe;

function isFastTf(tf: string): boolean {
  return (FAST_TRACK_TFS as readonly string[]).includes(tf);
}

type ScannerMarketsPayload = { tickers: string[]; spotDisplayByCoin?: Record<string, string> };

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
  const srcRaw = (response.headers.get("X-Pattern-Scan-Source") || "universe").trim();
  const source: PatternScanSource =
    srcRaw === "query" || srcRaw === "watchlist" || srcRaw === "universe" || srcRaw === "top_volume"
      ? srcRaw
      : "universe";
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

type ScanAlert = { key: string; coin: string; coinDisplay?: string; timeframe: string; patternName: string };

/** Scans all Hyperliquid markets; optional single-timeframe view; lists forming / formed / developed setups. */
export function PatternScannerUI() {
  const { address } = useWallet();
  const forceNocacheRef = useRef(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const scanHydratedRef = useRef(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<ScanAlert[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<ScannerTfSelection>("all");

  const marketsQuery = useQuery<ScannerMarketsPayload>({
    queryKey: ["/api/scanner/markets"],
    queryFn: async () => {
      const res = await fetch("/api/scanner/markets");
      if (!res.ok) throw new Error("Failed to load markets");
      return (await res.json()) as ScannerMarketsPayload;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const universeCount = marketsQuery.data?.tickers?.length ?? null;

  const fastTfParam = useMemo(() => {
    if (selectedTimeframe === "all") {
      return ALL_TF_LIST.filter((tf) => isFastTf(tf)).join(",");
    }
    return isFastTf(selectedTimeframe) ? selectedTimeframe : "";
  }, [selectedTimeframe]);

  const slowTfParam = useMemo(() => {
    if (selectedTimeframe === "all") {
      return ALL_TF_LIST.filter((tf) => !isFastTf(tf)).join(",");
    }
    return !isFastTf(selectedTimeframe) ? selectedTimeframe : "";
  }, [selectedTimeframe]);

  const timeframeScopeLabel =
    selectedTimeframe === "all" ? "all timeframes" : `${selectedTimeframe} only`;

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

  const spotDisplayByCoin = marketsQuery.data?.spotDisplayByCoin;

  const signals = useMemo(() => {
    if (isError) return [];
    const map = new Map<string, PatternSignal>();
    const dedupeKey = (p: PatternSignal) => `${p.coin}|${p.timeframe}|${p.patternName}`;
    for (const p of fastQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    for (const p of slowQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    const merged = [...map.values()].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
    if (!spotDisplayByCoin || Object.keys(spotDisplayByCoin).length === 0) return merged;
    return merged.map((s) => {
      if (!s.coin.startsWith("@")) return s;
      const fromServer = s.coinDisplay?.trim();
      if (fromServer) return s;
      const fromMap = spotDisplayByCoin[s.coin]?.trim();
      if (!fromMap) return s;
      return { ...s, coinDisplay: fromMap };
    });
  }, [isError, fastQuery.data, slowQuery.data, spotDisplayByCoin]);

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

  useEffect(() => {
    if (!isFetching) {
      setLastUpdate(new Date());
    }
  }, [isFetching]);

  useEffect(() => {
    scanHydratedRef.current = false;
    prevIdsRef.current = new Set();
  }, [selectedTimeframe]);

  useEffect(() => {
    if (isError || isLoading) return;
    const nowIds = new Set(signals.map((s) => s.id));
    if (!scanHydratedRef.current) {
      scanHydratedRef.current = true;
      prevIdsRef.current = nowIds;
      return;
    }
    const incoming: ScanAlert[] = [];
    for (const s of signals) {
      if (!prevIdsRef.current.has(s.id)) {
        incoming.push({
          key: `${s.id}-${Date.now()}`,
          coin: s.coin,
          coinDisplay: s.coinDisplay,
          timeframe: s.timeframe,
          patternName: s.patternName,
        });
      }
    }
    prevIdsRef.current = nowIds;
    if (incoming.length > 0) {
      playSetupChime();
      setAlerts((prev) => [...incoming, ...prev].slice(0, 12));
    }
  }, [signals, isError, isLoading]);

  const tabRows = useMemo(() => {
    const formingSignals = signals.filter((s) => s.patternStatus === "forming");
    const formedSignals = signals.filter((s) => s.patternStatus === "breakout_watch");
    const developedSignals = signals.filter((s) => s.patternStatus === "developed");
    return {
      all: signals,
      formingSignals,
      formedSignals,
      developedSignals,
    };
  }, [signals]);

  const dismissAlert = (key: string) => {
    setAlerts((prev) => prev.filter((a) => a.key !== key));
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 overflow-y-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <h1 className="text-xl md:text-3xl font-display font-bold">Market scanner</h1>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs md:text-sm text-muted-foreground">
            Scans all perps and spot markets from Hyperliquid
            {universeCount != null ? (
              <>
                {" "}
                (<strong>{universeCount}</strong> symbols)
              </>
            ) : null}
            . Choose a timeframe to see only that chart interval; leave <strong>All TF</strong> for everything (
            {ALL_TF_LIST.join(", ")}). Patterns stay grouped as forming, formed, or developed.
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

      <div className="space-y-1.5">
        <p className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wide">Timeframe</p>
        <ToggleGroup
          type="single"
          value={selectedTimeframe}
          onValueChange={(v) => {
            if (v) setSelectedTimeframe(v as ScannerTfSelection);
          }}
          variant="outline"
          size="sm"
          className="flex flex-wrap justify-start gap-1.5 h-auto p-0 bg-transparent"
        >
          <ToggleGroupItem value="all" className="text-[10px] md:text-xs px-2.5 py-1.5 shrink-0" aria-label="All timeframes">
            All TF
          </ToggleGroupItem>
          {ALL_TF_LIST.map((tf) => (
            <ToggleGroupItem key={tf} value={tf} className="text-[10px] md:text-xs px-2.5 py-1.5 shrink-0">
              {tf}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {alerts.length > 0 ? (
        <Alert className="border-emerald-500/40 bg-emerald-500/[0.07]">
          <AlertTitle className="text-sm">New patterns</AlertTitle>
          <AlertDescription className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.key}
                className="flex items-start justify-between gap-2 text-xs sm:text-sm text-muted-foreground"
              >
                <span>
                  <strong className="text-foreground" title={a.coin}>
                    {a.coinDisplay ?? a.coin}
                  </strong>{" "}
                  {a.timeframe} — {a.patternName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => dismissAlert(a.key)}
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

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
        refetchAll={refetchAll}
        timeframeScopeLabel={timeframeScopeLabel}
      />
    </div>
  );
}
