/**
 * Global pattern scanner — market universe helpers, rate-limit batching, health telemetry.
 * Fast-track: short TF work is batched aggressively; slow TF fetches run in parallel per coin (never sequential behind 1d).
 *
 * Hyperliquid-only candles — gold proxy: PAXG (+ XAUT-style when listed).
 */
import { getPerpUniverseCoinNames, getSpotTickers } from "./hyperliquid";
import { getDefaultPatternScanTickerList, PATTERN_SCAN_TOP_VOLUME_COUNT } from "./scanner-controller";

const parsedBatch = parseInt(process.env.PATTERN_SCAN_BATCH_SIZE || "", 10);
const parsedDelay = parseInt(process.env.PATTERN_SCAN_BATCH_DELAY_MS || "", 10);

/** Wider parallelism than legacy 5×2s — still staggered to respect HL limits. */
export const GLOBAL_SCANNER_BATCH_SIZE =
  Number.isFinite(parsedBatch) && parsedBatch >= 1 ? Math.min(parsedBatch, 20) : 12;

export const GLOBAL_SCANNER_BATCH_DELAY_MS =
  Number.isFinite(parsedDelay) && parsedDelay >= 0 ? Math.min(parsedDelay, 5000) : 400;

/** 1m / 3m / 5m — scanned on a short poll cadence (client + tighter server cache). */
export const FAST_TRACK_SCAN_TIMEFRAMES = ["1m", "3m", "5m"] as const;

/** Higher TFs — lower refresh rate; fetched in parallel with fast TFs per coin, not queued behind them. */
export const SLOW_SCAN_TIMEFRAMES = [
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
] as const;

export const PATTERN_SCAN_FAST_CACHE_TTL_MS = 20_000;
export const PATTERN_SCAN_SLOW_CACHE_TTL_MS = 180_000;

export const GLOBAL_SCANNER_GOLD_PROXY_INFO =
  "OANDA XAU/USD is not integrated; scanner uses Hyperliquid PAXG (perp) and tokenized gold spot pairs (e.g. XAUT) when active.";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function buildGlobalScannerTickerListOnce(): Promise<string[]> {
  const [perps, spots] = await Promise.all([getPerpUniverseCoinNames(), getSpotTickers()]);
  const set = new Set<string>();
  for (const p of perps) {
    if (p) set.add(p);
  }
  for (const s of spots) {
    const c = s.coin?.trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function buildGlobalScannerTickerList(): Promise<string[]> {
  let list = await buildGlobalScannerTickerListOnce();
  if (list.length === 0) {
    await sleep(500);
    list = await buildGlobalScannerTickerListOnce();
  }
  if (list.length === 0) {
    list = getDefaultPatternScanTickerList();
    console.warn("[GlobalScanner] HL universe empty — using hardcoded default ticker list (not DB).");
  }
  return list;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function isFastTrackTimeframe(tf: string): boolean {
  return (FAST_TRACK_SCAN_TIMEFRAMES as readonly string[]).includes(tf);
}

/** Minimum markets when host sets PATTERN_SCAN_ENFORCE_MAX_COINS — never run a tiny universe (e.g. 7). */
export function effectivePatternScanVolumeCap(requestedMax: number | null): number | null {
  if (requestedMax == null) return null;
  return Math.max(requestedMax, PATTERN_SCAN_TOP_VOLUME_COUNT);
}

// ── Scanner health (in-memory; enabled from Admin Command Center) ──

export type ScannerHealthErrorRow = { coin: string; phase: string; message: string };

export type ScannerHealthSnapshot = {
  monitoringEnabled: boolean;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  lastTimeframes: string[];
  totalCoinsPlanned: number;
  coinsCompleted: number;
  signalsEmitted: number;
  gold1mLagMs: number | null;
  alt1mThinOrEmpty: number;
  errors: ScannerHealthErrorRow[];
  statusSummary: string;
};

let scannerHealthMonitoringEnabled = false;

const defaultSnapshot: ScannerHealthSnapshot = {
  monitoringEnabled: false,
  lastScanAt: null,
  lastScanDurationMs: null,
  lastTimeframes: [],
  totalCoinsPlanned: 0,
  coinsCompleted: 0,
  signalsEmitted: 0,
  gold1mLagMs: null,
  alt1mThinOrEmpty: 0,
  errors: [],
  statusSummary: "No scan recorded yet.",
};

let lastHealth: ScannerHealthSnapshot = { ...defaultSnapshot };

export function setScannerHealthMonitoringEnabled(enabled: boolean): void {
  scannerHealthMonitoringEnabled = enabled;
  lastHealth = { ...lastHealth, monitoringEnabled: enabled };
}

export function getScannerHealthMonitoringEnabled(): boolean {
  return scannerHealthMonitoringEnabled;
}

export function getScannerHealthSnapshot(): ScannerHealthSnapshot {
  return {
    ...lastHealth,
    monitoringEnabled: scannerHealthMonitoringEnabled,
    errors: [...lastHealth.errors],
  };
}

function isGoldTicker(coin: string): boolean {
  const u = coin.toUpperCase();
  return u === "PAXG" || u.includes("XAUT") || u.includes("XAU");
}

function buildStatusSummary(h: ScannerHealthSnapshot): string {
  const parts: string[] = [];
  if (h.errors.length > 0) parts.push(`${h.errors.length} API/scan errors`);
  if (h.gold1mLagMs != null && h.gold1mLagMs > 120_000) parts.push(`Gold 1m data lag ~${Math.round(h.gold1mLagMs / 1000)}s`);
  if (h.alt1mThinOrEmpty > 0) parts.push(`${h.alt1mThinOrEmpty} alt tickers thin/empty on 1m`);
  if (parts.length === 0) return "OK — no lag or error flags on last scan.";
  return parts.join("; ");
}

export function finalizeScannerHealthRun(payload: {
  startedAt: number;
  timeframes: string[];
  totalCoinsPlanned: number;
  coinsCompleted: number;
  signalsEmitted: number;
  errors: ScannerHealthErrorRow[];
  gold1mLagMs: number | null;
  alt1mThinOrEmpty: number;
}): void {
  if (!scannerHealthMonitoringEnabled) return;
  const duration = Date.now() - payload.startedAt;
  lastHealth = {
    monitoringEnabled: true,
    lastScanAt: new Date().toISOString(),
    lastScanDurationMs: duration,
    lastTimeframes: [...payload.timeframes],
    totalCoinsPlanned: payload.totalCoinsPlanned,
    coinsCompleted: payload.coinsCompleted,
    signalsEmitted: payload.signalsEmitted,
    gold1mLagMs: payload.gold1mLagMs,
    alt1mThinOrEmpty: payload.alt1mThinOrEmpty,
    errors: payload.errors.slice(-80),
    statusSummary: "",
  };
  lastHealth.statusSummary = buildStatusSummary(lastHealth);
}

export function isGoldScannerTicker(coin: string): boolean {
  return isGoldTicker(coin);
}
