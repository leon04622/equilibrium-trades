/**
 * Global pattern-scanner market list, rate-limit-safe batching, and optional admin health telemetry.
 * Hyperliquid-only candles: there is no OANDA XAU/USD feed here — gold exposure uses HL perp PAXG and spot XAUT-style pairs when listed.
 */
import { getPerpUniverseCoinNames, getSpotTickers } from "./hyperliquid";

export const GLOBAL_SCANNER_BATCH_SIZE = 5;
export const GLOBAL_SCANNER_BATCH_DELAY_MS = 2000;

/** Same candle path as charts: HL `candleSnapshot` only. */
export const GLOBAL_SCANNER_GOLD_PROXY_INFO =
  "OANDA XAU/USD is not integrated; scanner uses Hyperliquid PAXG (perp) and tokenized gold spot pairs (e.g. XAUT) when active.";

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Active HL perp universe + spot pairs that pass `getSpotTickers` liquidity filter (`@index` symbols).
 */
export async function buildGlobalScannerTickerList(): Promise<string[]> {
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

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
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
  /** Max age of latest 1m bar (ms) among PAXG / XAUT-style tickers when 1m was scanned. */
  gold1mLagMs: number | null;
  /** Count of non-BTC coins where 1m bundle was empty or under 200 bars (stale feed or rate limit). */
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

/** Called by `scanForEducationalPatterns` when monitoring is on. */
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
