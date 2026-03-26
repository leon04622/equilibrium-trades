import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet, ARBITRUM_CHAIN_ID } from "@/lib/wallet-context";
import { TradeHandshakeModal } from "@/components/trade-handshake-modal";

type TradeHandshakeContextValue = {
  ensureTradeReady: () => Promise<boolean>;
};

const TradeHandshakeContext = createContext<TradeHandshakeContextValue | null>(null);

export function TradeHandshakeProvider({ children }: { children: ReactNode }) {
  const {
    isConnected,
    chainId,
    builderCodeApproved,
    hyperliquidSessionReady,
    signer,
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
    if (
      isConnected &&
      chainId === ARBITRUM_CHAIN_ID &&
      builderCodeApproved &&
      hyperliquidSessionReady &&
      signer
    ) {
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOpen(true);
    });
  }, [
    isConnected,
    chainId,
    builderCodeApproved,
    hyperliquidSessionReady,
    signer,
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
