/**
 * Trailing stop math for chart / Apex layer (ratchet + profit-lock styling).
 * Exchange sync uses callback rate + throttled modify; see trading-context + hyperliquid-client.
 */

export const HL_SL_RISK = "#f6465d";
/** Bright blue — SL dragged above entry (long) / below entry (short): profit-lock / trailing visual. */
export const HL_SL_PROFIT_LOCK = "#38bdf8";
/** Neon purple alternate accent for profit-lock state. */
export const HL_SL_PROFIT_LOCK_PURPLE = "#c084fc";

export function snapOrderPrice(price: number, refPrice: number): number {
  if (!Number.isFinite(price) || price <= 0) return price;
  const r = refPrice > 0 ? refPrice : price;
  const tick =
    r >= 50_000 ? 1 :
    r >= 10_000 ? 0.5 :
    r >= 1_000 ? 0.1 :
    r >= 100 ? 0.01 :
    r >= 10 ? 0.001 :
    r >= 1 ? 0.0001 :
    r >= 0.1 ? 0.00001 :
    0.0000001;
  const rounded = Math.round(price / tick) * tick;
  const dec = Math.min(8, Math.max(0, Math.ceil(-Math.log10(tick))));
  return parseFloat(rounded.toFixed(dec));
}

export function tickSize(refPrice: number): number {
  const r = refPrice > 0 ? refPrice : 1;
  if (r >= 50_000) return 1;
  if (r >= 10_000) return 0.5;
  if (r >= 1_000) return 0.1;
  if (r >= 100) return 0.01;
  if (r >= 10) return 0.001;
  if (r >= 1) return 0.0001;
  if (r >= 0.1) return 0.00001;
  return 0.0000001;
}

/** SL: only enforce “not through mark” (instant trigger). Entry is NOT a ceiling — allows profit-lock / trailing. */
export function clampSlDragPriceMarkOnly(
  price: number,
  isLong: boolean,
  mark: number,
  refPrice: number,
): number {
  let p = snapOrderPrice(price, refPrice);
  const tick = tickSize(refPrice || mark);
  const mk = mark > 0 ? mark : refPrice;
  if (mk <= 0) return p;
  if (isLong) {
    const maxSl = snapOrderPrice(mk - tick, refPrice);
    p = Math.min(p, maxSl);
    if (p >= mk) p = maxSl;
  } else {
    const minSl = snapOrderPrice(mk + tick, refPrice);
    p = Math.max(p, minSl);
    if (p <= mk) p = minSl;
  }
  return p;
}

export function clampTpDragPrice(
  price: number,
  isLong: boolean,
  entry: number,
  refPrice: number,
): number {
  let p = snapOrderPrice(price, refPrice);
  const tick = tickSize(refPrice || entry);
  if (entry > 0) {
    if (isLong) {
      const minTp = snapOrderPrice(entry + tick, refPrice);
      p = Math.max(p, minTp);
    } else {
      const maxTp = snapOrderPrice(entry - tick, refPrice);
      p = Math.min(p, maxTp);
    }
  }
  return p;
}

export function clampTpslDragPrice(
  kind: "tp" | "sl",
  price: number,
  isLong: boolean,
  entry: number,
  mark: number,
  refPrice: number,
): number {
  if (kind === "tp") return clampTpDragPrice(price, isLong, entry, refPrice);
  return clampSlDragPriceMarkOnly(price, isLong, mark, refPrice);
}

export function slIsProfitLockSide(isLong: boolean, entry: number, sl: number): boolean {
  if (entry <= 0 || !Number.isFinite(sl)) return false;
  return isLong ? sl > entry : sl < entry;
}

export function slLineColor(isLong: boolean, entry: number, sl: number): string {
  return slIsProfitLockSide(isLong, entry, sl) ? HL_SL_PROFIT_LOCK_PURPLE : HL_SL_RISK;
}

/**
 * Hyperliquid-style callback: distance from mark to stop as fraction of mark.
 * Long: (mark - sl) / mark ; Short: (sl - mark) / mark
 */
export function computeTrailingCallbackRateDecimal(
  isLong: boolean,
  mark: number,
  slPrice: number,
): number | null {
  if (mark <= 0 || !Number.isFinite(slPrice)) return null;
  if (isLong) {
    if (slPrice >= mark) return null;
    return (mark - slPrice) / mark;
  }
  if (slPrice <= mark) return null;
  return (slPrice - mark) / mark;
}

/** “Distance to trigger” as percent of mark (room until stop). */
export function distanceToTriggerPercent(isLong: boolean, mark: number, slPrice: number): number | null {
  const d = computeTrailingCallbackRateDecimal(isLong, mark, slPrice);
  return d != null ? d * 100 : null;
}

export interface TrailingStopSession {
  coin: string;
  isLong: boolean;
  /** Fixed distance: long = mark - sl, short = sl - mark at commit time. */
  trailDistanceAbs: number;
  ratchetSl: number;
}

export function createTrailingSession(
  coin: string,
  isLong: boolean,
  mark: number,
  committedSl: number,
  refPrice: number,
): TrailingStopSession | null {
  const rate = computeTrailingCallbackRateDecimal(isLong, mark, committedSl);
  if (rate == null || rate <= 0) return null;
  const dist = isLong ? mark - committedSl : committedSl - mark;
  if (!(dist > 0)) return null;
  return { coin, isLong, trailDistanceAbs: dist, ratchetSl: snapOrderPrice(committedSl, refPrice) };
}

/** Ratchet: long SL only rises with mark; short SL only falls. */
export function advanceTrailingRatchet(
  session: TrailingStopSession,
  mark: number,
  refPrice: number,
): TrailingStopSession {
  const mk = mark > 0 ? mark : refPrice;
  const tick = tickSize(refPrice || mk);
  if (session.isLong) {
    const ideal = snapOrderPrice(mk - session.trailDistanceAbs, refPrice);
    const cap = snapOrderPrice(mk - tick, refPrice);
    const clamped = Math.min(ideal, cap);
    const nextSl = Math.max(session.ratchetSl, clamped);
    return { ...session, ratchetSl: nextSl };
  }
  const ideal = snapOrderPrice(mk + session.trailDistanceAbs, refPrice);
  const floor = snapOrderPrice(mk + tick, refPrice);
  const clamped = Math.max(ideal, floor);
  const nextSl = Math.min(session.ratchetSl, clamped);
  return { ...session, ratchetSl: nextSl };
}
