const PREFIX = "eq_chart_candles_v1";
const MAX = 500;

export type StoredCandle = {
  t: number;
  o: number | string;
  h: number | string;
  l: number | string;
  c: number | string;
  v: number | string;
};

export function candleStorageKey(coin: string, interval: string): string {
  return `${PREFIX}:${coin.trim()}:${interval.trim()}`;
}

export function loadCachedCandles(coin: string, interval: string): StoredCandle[] {
  try {
    const raw = localStorage.getItem(candleStorageKey(coin, interval));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX) as StoredCandle[];
  } catch {
    return [];
  }
}

export function saveCachedCandles(coin: string, interval: string, candles: StoredCandle[]): void {
  try {
    const trimmed = candles.length > MAX ? candles.slice(-MAX) : candles;
    localStorage.setItem(candleStorageKey(coin, interval), JSON.stringify(trimmed));
  } catch {
    /* quota / private mode */
  }
}
