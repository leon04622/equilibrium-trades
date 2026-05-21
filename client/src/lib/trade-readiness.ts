import type { JsonRpcSigner } from "ethers";
import { hasLocalLifetimeHandshakeDone } from "@/lib/TradeExecution";
import { isHyperliquidTradingSessionReady } from "@/lib/hyperliquid-client";

export const ARBITRUM_CHAIN_ID = 42161;

export type TradeReadinessSnapshot = {
  address: string | null;
  chainId: number | null;
  builderCodeApproved: boolean;
  hyperliquidSessionReady: boolean;
};

/** Builder + HL agent setup complete (ignores chain — fix chain separately). */
export function isTradingHandshakeComplete(snapshot: TradeReadinessSnapshot): boolean {
  const { address, builderCodeApproved, hyperliquidSessionReady } = snapshot;
  if (!address) return false;
  const builderOk = builderCodeApproved || hasLocalLifetimeHandshakeDone(address);
  const sessionOk =
    hyperliquidSessionReady || isHyperliquidTradingSessionReady(address);
  return builderOk && sessionOk;
}

/** Ready to place orders: connected, on Arbitrum, handshake done. */
export function isFullyTradeReady(
  snapshot: TradeReadinessSnapshot & { isConnected: boolean; hasSigner: boolean },
): boolean {
  if (!snapshot.isConnected || !snapshot.hasSigner || !snapshot.address) return false;
  if (snapshot.chainId !== ARBITRUM_CHAIN_ID) return false;
  return isTradingHandshakeComplete(snapshot);
}

/** Poll wallet network after switchToArbitrum (React chainId state can lag). */
export async function ensureWalletOnArbitrum(
  signer: JsonRpcSigner,
  switchToArbitrum: () => Promise<void>,
  maxWaitMs = 5000,
): Promise<boolean> {
  const readChain = async (): Promise<number | null> => {
    try {
      const nw = await signer.provider?.getNetwork();
      return nw != null ? Number(nw.chainId) : null;
    } catch {
      return null;
    }
  };

  let id = await readChain();
  if (id === ARBITRUM_CHAIN_ID) return true;

  try {
    await switchToArbitrum();
  } catch {
    return false;
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    id = await readChain();
    if (id === ARBITRUM_CHAIN_ID) return true;
  }
  return false;
}
