/** Extend a segment to span the full chart width (TradingView-style ray). */
export function extendTrendlineToWidth(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
): { x1: number; y1: number; x2: number; y2: number } {
  if (width <= 0) return { x1, y1, x2, y2 };
  if (Math.abs(x2 - x1) < 0.5) {
    return { x1: x1, y1: 0, x2: x2, y2: 9999 };
  }
  const slope = (y2 - y1) / (x2 - x1);
  return {
    x1: 0,
    y1: y1 + slope * (0 - x1),
    x2: width,
    y2: y1 + slope * (width - x1),
  };
}
