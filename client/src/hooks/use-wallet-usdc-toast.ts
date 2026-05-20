import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/lib/trading-context";

/** Notify when Arbitrum wallet USDC balance increases (Revolut / external send). */
export function useWalletUsdcReceivedToast() {
  const { toast } = useToast();
  const { walletUsdcArbitrum, isLoadingWalletUsdc } = useTrading();
  const prevRef = useRef<number | null>(null);
  const bootRef = useRef(true);

  useEffect(() => {
    if (isLoadingWalletUsdc) return;
    const cur = walletUsdcArbitrum;
    if (bootRef.current) {
      bootRef.current = false;
      prevRef.current = cur;
      return;
    }
    const prev = prevRef.current ?? 0;
    if (cur > prev + 0.009) {
      const delta = cur - prev;
      toast({
        title: "USDC received in your wallet",
        description: `${delta.toFixed(2)} USDC is on Arbitrum. Tap "Add to trading" on Funding to use it.`,
        duration: 12000,
      });
    }
    prevRef.current = cur;
  }, [walletUsdcArbitrum, isLoadingWalletUsdc, toast]);
}
