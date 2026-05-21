import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@/lib/wallet-context";
import { TradeHandshakeModal } from "@/components/trade-handshake-modal";
import {
  ARBITRUM_CHAIN_ID,
  ensureWalletOnArbitrum,
  isFullyTradeReady,
  isTradingHandshakeComplete,
} from "@/lib/trade-readiness";

type TradeHandshakeContextValue = {
  ensureTradeReady: () => Promise<boolean>;
};

const TradeHandshakeContext = createContext<TradeHandshakeContextValue | null>(null);

export function TradeHandshakeProvider({ children }: { children: ReactNode }) {
  const {
    isConnected,
    address,
    chainId,
    builderCodeApproved,
    hyperliquidSessionReady,
    signer,
    switchToArbitrum,
    prepareHyperliquidSession,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const finalize = useCallback((ok: boolean) => {
    setOpen(false);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(ok);
  }, []);

  const ensureTradeReady = useCallback(async () => {
    if (!isConnected || !signer || !address) {
      return await new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setOpen(true);
      });
    }

    const snap = {
      address,
      chainId,
      builderCodeApproved,
      hyperliquidSessionReady,
      isConnected,
      hasSigner: true,
    };

    if (chainId !== ARBITRUM_CHAIN_ID) {
      const onArb = await ensureWalletOnArbitrum(signer, switchToArbitrum);
      if (!onArb) {
        return await new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setOpen(true);
        });
      }
    }

    if (isFullyTradeReady({ ...snap, chainId: ARBITRUM_CHAIN_ID })) {
      return true;
    }

    if (isTradingHandshakeComplete(snap)) {
      const restored = await prepareHyperliquidSession();
      if (restored.success) return true;
    }

    return await new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOpen(true);
    });
  }, [
    isConnected,
    address,
    chainId,
    builderCodeApproved,
    hyperliquidSessionReady,
    signer,
    switchToArbitrum,
    prepareHyperliquidSession,
  ]);

  return (
    <TradeHandshakeContext.Provider value={{ ensureTradeReady }}>
      {children}
      <TradeHandshakeModal open={open} onFinalize={finalize} />
    </TradeHandshakeContext.Provider>
  );
}

export function useTradeHandshake() {
  const ctx = useContext(TradeHandshakeContext);
  if (!ctx) {
    throw new Error("useTradeHandshake must be used within TradeHandshakeProvider");
  }
  return ctx;
}
