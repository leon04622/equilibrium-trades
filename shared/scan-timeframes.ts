/** Must match server pattern scan defaults in `routes.ts`. */
export const SCAN_ALL_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "1d",
] as const;

export type ScanTimeframe = (typeof SCAN_ALL_TIMEFRAMES)[number];
