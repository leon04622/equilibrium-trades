/**
 * Confirms TP/SL orders are resting on Hyperliquid (venue truth — not UI state).
 */
import { selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import { convertRawFrontendOrdersToHl } from "@/lib/hl-account-map";
import {
  getAccountState,
  getClearinghouseStateViaInfoClient,
  getOpenOrders,
} from "@/lib/hyperliquid-client";
import { snapOrderPrice } from "@/lib/trailing-stop-orchestrator";
import type { Position } from "@/lib/trading-context";

export function tpslPricesMatch(a: number, b: number, refPrice: number): boolean {
  const tol = Math.max(1e-8, Math.abs(refPrice) * 1e-8, 1e-6);
  return Math.abs(a - b) <= tol;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchVenueTpSlForCoin(
  walletAddress: string,
  coin: string,
  position: Position,
) {
  const raw = await getOpenOrders(walletAddress);
  const orders = convertRawFrontendOrdersToHl(raw ?? []);
  return selectTpSlOrders(coin, position, orders);
}

export type WaitedPosition = {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
};

/** Poll clearinghouse until a non-zero position exists (post-fill race). */
export async function waitForClearinghousePosition(
  walletAddress: string,
  coin: string,
  options?: { maxAttempts?: number; intervalMs?: number },
): Promise<WaitedPosition | null> {
  const maxAttempts = options?.maxAttempts ?? 15;
  const intervalMs = options?.intervalMs ?? 400;

  for (let i = 0; i < maxAttempts; i++) {
    const accountState =
      (await getClearinghouseStateViaInfoClient(walletAddress)) ??
      (await getAccountState(walletAddress));
    const ap = accountState?.assetPositions?.find((p) => p.position.coin === coin);
    if (ap) {
      const szi = parseFloat(ap.position.szi);
      if (szi !== 0) {
        const entryPrice = parseFloat(ap.position.entryPx) || 0;
        return {
          coin,
          side: szi > 0 ? "long" : "short",
          size: Math.abs(szi),
          entryPrice,
          markPrice: entryPrice,
        };
      }
    }
    if (i < maxAttempts - 1) await sleep(intervalMs);
  }
  return null;
}

export function waitedPositionToPosition(waited: WaitedPosition): Position {
  return {
    id: `hl-${waited.coin}-verify`,
    coin: waited.coin,
    side: waited.side,
    size: waited.size,
    entryPrice: waited.entryPrice,
    markPrice: waited.markPrice,
    leverage: 1,
    margin: 0,
    unrealizedPnl: 0,
    unrealizedPnlPercent: 0,
    liquidationPrice: 0,
    openedAt: new Date(),
  };
}

export async function verifyVenueTpslResting(args: {
  walletAddress: string;
  coin: string;
  position: Position;
  snapRef: number;
  expectedTp?: number | null;
  expectedSl?: number | null;
  attempts?: number;
  delayMs?: number;
}): Promise<{ tpOk: boolean; slOk: boolean }> {
  const wantTp = args.expectedTp != null && args.expectedTp > 0;
  const wantSl = args.expectedSl != null && args.expectedSl > 0;
  let tpOk = !wantTp;
  let slOk = !wantSl;
  if (!wantTp && !wantSl) return { tpOk: true, slOk: true };

  const tpSnap = wantTp ? snapOrderPrice(args.expectedTp!, args.snapRef) : null;
  const slSnap = wantSl ? snapOrderPrice(args.expectedSl!, args.snapRef) : null;
  const attempts = args.attempts ?? 6;
  const delayMs = args.delayMs ?? 350;

  for (let i = 0; i < attempts; i++) {
    const { tpPrice, slPrice } = await fetchVenueTpSlForCoin(
      args.walletAddress,
      args.coin,
      args.position,
    );
    if (wantTp && tpSnap != null && tpPrice != null && tpslPricesMatch(tpPrice, tpSnap, args.snapRef)) {
      tpOk = true;
    }
    if (wantSl && slSnap != null && slPrice != null && tpslPricesMatch(slPrice, slSnap, args.snapRef)) {
      slOk = true;
    }
    if (tpOk && slOk) break;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return { tpOk, slOk };
}
