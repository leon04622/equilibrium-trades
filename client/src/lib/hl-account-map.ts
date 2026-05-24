/**
 * Shared mapping from venue API / WebSocket payloads → app models.
 * Keeps REST polling, SDK info calls, and WS subscriptions aligned (1:1 with L1 truth).
 */
import type { HLOpenOrder } from "@/lib/trading-context";
import type { AccountState } from "@/lib/hyperliquid-client";

export interface DashboardPositionRow {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  liquidationPrice: number;
}

/** Map `frontendOpenOrders` / WS `openOrders` rows → {@link HLOpenOrder}. */
export function convertRawFrontendOrdersToHl(raw: unknown[]): HLOpenOrder[] {
  return (raw || []).map((ord: any) => {
    let orderType: "limit" | "stop_loss" | "take_profit" = "limit";
    const ot = (ord.orderType || "").toLowerCase();
    const tc = (ord.triggerCondition || ord.tpsl || "").toLowerCase();
    if (ord.isStopLoss === true) {
      orderType = "stop_loss";
    } else if (ord.tpsl === "sl" || tc === "sl") {
      orderType = "stop_loss";
    } else if (ord.tpsl === "tp" || tc === "tp") {
      orderType = "take_profit";
    } else if (ot.includes("take profit")) {
      orderType = "take_profit";
    } else if (ot.includes("stop")) {
      orderType = "stop_loss";
    }
    // Do not infer TP/SL from triggerCondition "above"/"below" alone — wrong for shorts.
    const oidRaw = ord.oid;
    const oidNum = typeof oidRaw === "string" ? parseInt(oidRaw, 10) : Number(oidRaw);
    const hlTpslRaw = (ord.tpsl || tc || "").toLowerCase();
    const hlTpsl: "tp" | "sl" | undefined =
      hlTpslRaw === "tp" ? "tp" : hlTpslRaw === "sl" ? "sl" : undefined;
    return {
      coin: ord.coin,
      oid: Number.isFinite(oidNum) ? oidNum : 0,
      side: ord.side,
      sz: ord.sz,
      limitPx: ord.limitPx,
      timestamp: ord.timestamp,
      origSz: ord.origSz,
      orderType,
      triggerPx: ord.triggerPx,
      isTrigger: ord.isTrigger === true,
      reduceOnly: ord.reduceOnly === true,
      hlTpsl,
    };
  });
}

/** Perp rows from clearinghouse `assetPositions` + mids for mark. */
export function mapClearinghouseAssetPositionsToDashboard(
  assetPositions: AccountState["assetPositions"] | undefined,
  mids: Record<string, number>,
): DashboardPositionRow[] {
  if (!assetPositions?.length) return [];
  return assetPositions
    .filter((ap) => parseFloat(ap.position.szi) !== 0)
    .map((ap) => {
      const szi = parseFloat(ap.position.szi);
      const coin = ap.position.coin;
      const entryPrice = parseFloat(ap.position.entryPx);
      const unrealizedPnl = parseFloat(ap.position.unrealizedPnl);
      const marginUsed = parseFloat(ap.position.marginUsed || "0");
      const markPrice = mids[coin] || entryPrice;
      return {
        coin,
        side: szi > 0 ? ("long" as const) : ("short" as const),
        size: Math.abs(szi),
        entryPrice,
        markPrice,
        leverage: ap.position.leverage?.value || 1,
        margin: marginUsed,
        unrealizedPnl,
        unrealizedPnlPercent: marginUsed > 0 ? (unrealizedPnl / marginUsed) * 100 : 0,
        liquidationPrice: ap.position.liquidationPx ? parseFloat(ap.position.liquidationPx) : 0,
      };
    });
}

export function applyMarginSummaryFromAccountState(
  accountState: Pick<AccountState, "marginSummary" | "withdrawable"> | null,
  setters: {
    setAccountValue: (n: number) => void;
    setMarginUsed: (n: number) => void;
    setBalance: (n: number) => void;
    setWithdrawable: (n: number) => void;
  },
): void {
  if (!accountState?.marginSummary) return;
  const accValue = parseFloat(accountState.marginSummary.accountValue || "0");
  const margUsed = parseFloat(accountState.marginSummary.totalMarginUsed || "0");
  const withdrawableVal = parseFloat(accountState.withdrawable || "0");
  setters.setAccountValue(accValue);
  setters.setMarginUsed(margUsed);
  setters.setBalance(accValue - margUsed);
  setters.setWithdrawable(
    withdrawableVal > 0 ? withdrawableVal : Math.max(0, accValue - margUsed),
  );
}
