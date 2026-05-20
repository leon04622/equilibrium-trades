export type ChartDrawingPoint = {
  /** Unix seconds (lightweight-charts UTCTimestamp) */
  time: number;
  price: number;
};

export type ChartDrawingType =
  | "trendline"
  | "hline"
  | "rect"
  | "polyline"
  | "bull_flag";

export type ChartDrawing = {
  id: string;
  type: ChartDrawingType;
  points: ChartDrawingPoint[];
  color: string;
  label?: string;
  updatedAt: number;
};

export type ChartDrawingStore = {
  version: 1;
  drawings: ChartDrawing[];
};

const STORE_VERSION = 1 as const;

export function chartDrawingsStorageKey(
  coin: string,
  interval: string,
  wallet?: string | null,
): string {
  const w = (wallet || "local").toLowerCase();
  return `eq-chart-drawings:v${STORE_VERSION}:${w}:${coin}:${interval}`;
}

export function loadChartDrawings(
  coin: string,
  interval: string,
  wallet?: string | null,
): ChartDrawing[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(chartDrawingsStorageKey(coin, interval, wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChartDrawingStore;
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.drawings)) return [];
    return parsed.drawings.filter(
      (d) => d?.id && d.type && Array.isArray(d.points) && d.points.length > 0,
    );
  } catch {
    return [];
  }
}

export function saveChartDrawings(
  coin: string,
  interval: string,
  drawings: ChartDrawing[],
  wallet?: string | null,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: ChartDrawingStore = { version: STORE_VERSION, drawings };
    localStorage.setItem(
      chartDrawingsStorageKey(coin, interval, wallet),
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode */
  }
}

export function newDrawingId(): string {
  return `draw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Bull flag: pole low → pole high → flag high → flag low */
export function bullFlagGuideStep(index: number): string {
  switch (index) {
    case 0:
      return "Click pole base (start of rally)";
    case 1:
      return "Click pole top (end of rally)";
    case 2:
      return "Click upper flag trendline";
    case 3:
      return "Click lower flag trendline";
    default:
      return "";
  }
}
