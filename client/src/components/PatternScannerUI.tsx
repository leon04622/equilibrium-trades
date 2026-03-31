import { useState, useEffect, useMemo, useRef } from "react";
import { RefreshCw, Activity, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { SCAN_ALL_TIMEFRAMES, type ScanTimeframe } from "@shared/scan-timeframes";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWallet } from "@/lib/wallet-context";
import { Input } from "@/components/ui/input";
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

type ScannerMarketsPayload = { tickers: string[]; displayByCoin?: Record<string, string> };

async function fetchPatternScanPayload(
  timeframes: string,
  wallet: string | null | undefined,
  nocache: boolean,
  coinsParam?: string,
): Promise<PatternScanPayload> {
  const qs =
    `timeframes=${encodeURIComponent(timeframes)}` +
    (nocache ? "&nocache=1" : "") +
    (coinsParam?.trim() ? `&coins=${encodeURIComponent(coinsParam)}` : "");
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

function normalizeScanText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function buildScannerMarketLabel(coin: string, displayByCoin?: Record<string, string>): string {
  return displayByCoin?.[coin]?.trim() || coin;
}

/** Scans all Hyperliquid markets; optional single-timeframe view; lists forming / developed setups. */
export function PatternScannerUI() {
  const { address } = useWallet();
  const forceNocacheRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedTimeframe, setSelectedTimeframe] = useState<ScannerTfSelection>("all");
  const [selectedMarketLabels, setSelectedMarketLabels] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

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
  const displayByCoin = marketsQuery.data?.displayByCoin;
  const searchTerms = useMemo(
    () => [...selectedMarketLabels, searchInput.trim()].filter(Boolean),
    [selectedMarketLabels, searchInput],
  );
  const matchedScanCoins = useMemo(() => {
    if (searchTerms.length === 0) return [];
    const tickers = marketsQuery.data?.tickers ?? [];
    const out = new Set<string>();
    for (const term of searchTerms) {
      const norm = normalizeScanText(term);
      for (const coin of tickers) {
        const label = displayByCoin?.[coin] || coin;
        const rawNorm = normalizeScanText(coin);
        const labelNorm = normalizeScanText(label);
        if (
          rawNorm === norm ||
          labelNorm === norm ||
          rawNorm.includes(norm) ||
          labelNorm.includes(norm)
        ) {
          out.add(coin);
        }
      }
    }
    return [...out];
  }, [searchTerms, marketsQuery.data?.tickers, displayByCoin]);
  const scopedCoinsParam = matchedScanCoins.join(",");
  const usingSearchScope = searchTerms.length > 0;
  const noSearchMatches = usingSearchScope && matchedScanCoins.length === 0;
  const effectiveUniverseCount = usingSearchScope ? matchedScanCoins.length : universeCount;
  const autocompleteOptions = useMemo(() => {
    const fragment = normalizeScanText(searchInput);
    if (!fragment) return [];
    const tickers = marketsQuery.data?.tickers ?? [];
    const ranked = tickers
      .map((coin) => {
        const label = buildScannerMarketLabel(coin, displayByCoin);
        if (
          selectedMarketLabels.some((selected) => normalizeScanText(selected) === normalizeScanText(label))
        ) {
          return null;
        }
        const rawNorm = normalizeScanText(coin);
        const labelNorm = normalizeScanText(label);
        const exact = rawNorm === fragment || labelNorm === fragment;
        const starts =
          rawNorm.startsWith(fragment) || labelNorm.startsWith(fragment);
        const includes =
          rawNorm.includes(fragment) || labelNorm.includes(fragment);
        if (!exact && !starts && !includes) return null;
        return {
          coin,
          label,
          score: exact ? 0 : starts ? 1 : 2,
        };
      })
      .filter((v): v is { coin: string; label: string; score: number } => v !== null)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.label.localeCompare(b.label);
      });
    return ranked.slice(0, 12);
  }, [searchInput, marketsQuery.data?.tickers, displayByCoin, selectedMarketLabels]);

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
    queryKey: ["/api/signals/patterns", "fast", fastTfParam, scopedCoinsParam, address ?? ""],
    enabled: fastTfParam.length > 0 && !noSearchMatches,
    queryFn: () =>
      fetchPatternScanPayload(fastTfParam, address, forceNocacheRef.current, scopedCoinsParam),
    refetchInterval: (q) =>
      q.state.status === "error" || !fastTfParam ? false : 10_000,
    staleTime: 5_000,
    retry: 1,
  });

  const slowQuery = useQuery<PatternScanPayload>({
    queryKey: ["/api/signals/patterns", "slow", slowTfParam, scopedCoinsParam, address ?? ""],
    enabled: slowTfParam.length > 0 && !noSearchMatches,
    queryFn: () =>
      fetchPatternScanPayload(slowTfParam, address, forceNocacheRef.current, scopedCoinsParam),
    refetchInterval: (q) =>
      q.state.status === "error" || !slowTfParam ? false : 180_000,
    staleTime: 120_000,
    retry: 1,
  });

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
    const dedupeKey = (p: PatternSignal) =>
      `${p.coin}|${p.timeframe}|${p.patternName}|${p.patternStatus}`;
    for (const p of fastQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    for (const p of slowQuery.data?.patterns ?? []) map.set(dedupeKey(p), p);
    const merged = [...map.values()].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
    if (!displayByCoin || Object.keys(displayByCoin).length === 0) return merged;
    return merged.map((s) => {
      const fromServer = s.coinDisplay?.trim();
      if (fromServer) return s;
      const fromMap = displayByCoin[s.coin]?.trim();
      if (!fromMap) return s;
      return { ...s, coinDisplay: fromMap };
    });
  }, [isError, fastQuery.data, slowQuery.data, displayByCoin]);

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
    function handleOutsideClick(event: MouseEvent) {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function applySearchSelection(label: string) {
    setSelectedMarketLabels((prev) => {
      if (prev.some((selected) => normalizeScanText(selected) === normalizeScanText(label))) {
        return prev;
      }
      return [...prev, label];
    });
    setSearchInput("");
    setSearchOpen(false);
  }

  function removeSelectedMarket(label: string) {
    setSelectedMarketLabels((prev) =>
      prev.filter((selected) => normalizeScanText(selected) !== normalizeScanText(label)),
    );
  }

  const tabRows = useMemo(() => {
    const formingSignals = signals.filter((s) => s.patternStatus === "forming");
    const developedSignals = signals.filter(
      (s) => s.patternStatus === "developed" || s.patternStatus === "breakout_watch",
    );
    return {
      all: signals,
      formingSignals,
      developedSignals,
    };
  }, [signals]);

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
            {ALL_TF_LIST.join(", ")}). Patterns stay grouped as forming or developed.
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

      <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs">
        <div className="rounded-full border bg-card/40 px-3 py-1.5 text-muted-foreground">
          Universe: <strong className="text-foreground">{effectiveUniverseCount ?? "..."}</strong> markets
        </div>
        <div className="rounded-full border bg-card/40 px-3 py-1.5 text-muted-foreground">
          Mode: <strong className="text-foreground">{selectedTimeframe === "all" ? "All timeframes" : selectedTimeframe}</strong>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wide">Scan markets</p>
        <div ref={searchBoxRef} className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchOpen(false);
                return;
              }
              if (e.key === "Backspace" && !searchInput && selectedMarketLabels.length > 0) {
                setSelectedMarketLabels((prev) => prev.slice(0, -1));
                return;
              }
              if (e.key === "Enter" && autocompleteOptions.length > 0) {
                e.preventDefault();
                applySearchSelection(autocompleteOptions[0]!.label);
              }
            }}
            placeholder={
              selectedMarketLabels.length > 0
                ? "Add another market..."
                : "Type BTC, ETH, SOL, BTC-USDC, or any market name"
            }
            className="pl-9"
            data-testid="input-scan-markets"
          />
          {searchOpen && autocompleteOptions.length > 0 ? (
            <div className="absolute z-30 mt-2 w-full rounded-md border bg-popover p-1 shadow-lg">
              {autocompleteOptions.map((option) => (
                <button
                  key={option.coin}
                  type="button"
                  className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => applySearchSelection(option.label)}
                >
                  <span className="truncate">{option.label}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">{option.coin}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {selectedMarketLabels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {selectedMarketLabels.map((label) => (
              <button
                key={label}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-foreground"
                onClick={() => removeSelectedMarket(label)}
                aria-label={`Remove ${label}`}
              >
                <span>{label}</span>
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSelectedMarketLabels([])}
            >
              Clear
            </Button>
          </div>
        ) : null}
        <p className="text-[10px] md:text-xs text-muted-foreground">
          Leave blank to scan the whole universe. Pick one or more markets to scope the scan instantly.
        </p>
        {usingSearchScope ? (
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {matchedScanCoins.length > 0
              ? `Scanning ${matchedScanCoins.length} matching market${matchedScanCoins.length === 1 ? "" : "s"}.`
              : "No markets matched that search yet."}
          </p>
        ) : null}
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

      {!usingSearchScope && universeCount != null && universeCount < 25 ? (
        <Alert className="border-amber-500/40 bg-amber-500/[0.06]">
          <AlertTitle className="text-sm">Limited market universe ({universeCount} symbols)</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            This deployment is using a reduced fallback universe instead of Hyperliquid&apos;s full live market list.
            Fewer markets means fewer setups. Once the host can load the live HL universe reliably, this count should
            jump much higher automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      {noSearchMatches ? (
        <Alert>
          <AlertTitle className="text-sm">No matching markets</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            Try a broader search like <code>BTC</code> or <code>ETH</code>, or clear the input to scan the full universe.
          </AlertDescription>
        </Alert>
      ) : null}

      {!noSearchMatches ? (
        <PatternResults
          signals={signals}
          tabRows={tabRows}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          error={error}
          scanMeta={scanMeta}
          scanHasCompleted={scanHasCompleted}
          refetchAll={refetchAll}
          timeframeScopeLabel={timeframeScopeLabel}
          singleFastTimeframeOnly={selectedTimeframe !== "all" && isFastTf(selectedTimeframe)}
        />
      ) : null}
    </div>
  );
}
