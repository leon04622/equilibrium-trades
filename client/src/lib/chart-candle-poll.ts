/** REST poll cadence — short intervals need frequent refresh to match HL candleSnapshot wicks. */

export const CHART_CANDLE_POLL_MS: Record<string, number> = {
  "1m": 2_000,
  "3m": 2_500,
  "5m": 3_000,
  "15m": 5_000,
  "30m": 8_000,
  "1h": 10_000,
  "2h": 12_000,
  "4h": 15_000,
  "1d": 20_000,
};

export function chartCandlePollMs(interval: string): number {
  return CHART_CANDLE_POLL_MS[interval] ?? 5_000;
}
