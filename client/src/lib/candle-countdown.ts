/** Candle interval string (Hyperliquid / app) → period length in seconds. */
const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "1d": 86400,
};

export function intervalToSeconds(interval: string): number {
  return INTERVAL_SECONDS[interval] ?? 300;
}

/** `openMs` = candle open time in milliseconds (Hyperliquid `t`). */
export function candleCloseMs(openMs: number, interval: string): number {
  const periodMs = intervalToSeconds(interval) * 1000;
  return openMs + periodMs;
}

export function msUntilCandleClose(openMs: number, interval: string, nowMs = Date.now()): number {
  return Math.max(0, candleCloseMs(openMs, interval) - nowMs);
}

/** TradingView-style countdown: m:ss or h:mm:ss for longer intervals. */
export function formatCandleCountdown(msLeft: number): string {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function intervalShortLabel(interval: string): string {
  return interval;
}
