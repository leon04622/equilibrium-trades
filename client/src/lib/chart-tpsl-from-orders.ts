import type { HLOpenOrder, Position } from "@/lib/trading-context";

export type TpslOrderKind = "tp" | "sl" | "other";

/** Classify HL trigger order as TP or SL (same rules as chart UI). */
export function orderKindForTpsl(
  order: HLOpenOrder,
  position: Position,
  _markPx: number,
): TpslOrderKind {
  const ot = (order.orderType || "").toLowerCase();
  if (ot === "take_profit" || ot.includes("take")) return "tp";
  if (ot === "stop_loss" || (ot.includes("stop") && !ot.includes("take"))) return "sl";
  const trigPx = parseFloat(order.triggerPx || order.limitPx || "0");
  if (!trigPx || Number.isNaN(trigPx)) return "other";
  const entry = position.entryPrice;
  return position.side === "long"
    ? trigPx > entry
      ? "tp"
      : "sl"
    : trigPx < entry
      ? "tp"
      : "sl";
}

export function ghostTpslPrices(
  entry: number,
  markPx: number,
  isLong: boolean,
  hasTp: boolean,
  hasSl: boolean,
): { ghostTp: number | null; ghostSl: number | null } {
  let ghostTp: number | null = null;
  let ghostSl: number | null = null;
  const mark = markPx > 0 ? markPx : entry;
  if (!hasTp) {
    ghostTp = isLong ? entry * 1.012 : entry * 0.988;
  }
  if (!hasSl) {
    if (isLong) {
      ghostSl = Math.min(entry * 0.988, mark * 0.992);
      if (ghostSl >= mark) ghostSl = mark * 0.99;
    } else {
      ghostSl = Math.max(entry * 1.012, mark * 1.008);
      if (ghostSl <= mark) ghostSl = mark * 1.01;
    }
  }
  return { ghostTp, ghostSl };
}

export function selectTpSlOrders(
  coin: string,
  position: Position | undefined,
  openOrders: HLOpenOrder[],
): { tpOrder?: HLOpenOrder; slOrder?: HLOpenOrder; tpPrice: number | null; slPrice: number | null } {
  if (!position) {
    return { tpPrice: null, slPrice: null };
  }
  const markPx = position.markPrice || position.entryPrice;
  const coinOrders = openOrders.filter((o) => o.coin === coin);
  let tpOrder: HLOpenOrder | undefined;
  let slOrder: HLOpenOrder | undefined;
  for (const o of coinOrders) {
    const k = orderKindForTpsl(o, position, markPx);
    if (k === "tp" && !tpOrder) tpOrder = o;
    if (k === "sl" && !slOrder) slOrder = o;
  }
  const tpPrice = tpOrder ? parseFloat(tpOrder.triggerPx || tpOrder.limitPx) : null;
  const slPrice = slOrder ? parseFloat(slOrder.triggerPx || slOrder.limitPx) : null;
  return {
    tpOrder,
    slOrder,
    tpPrice: tpPrice != null && !Number.isNaN(tpPrice) && tpPrice > 0 ? tpPrice : null,
    slPrice: slPrice != null && !Number.isNaN(slPrice) && slPrice > 0 ? slPrice : null,
  };
}
