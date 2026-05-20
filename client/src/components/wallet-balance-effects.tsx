import { useWalletUsdcReceivedToast } from "@/hooks/use-wallet-usdc-toast";

/** Mount inside TradingProvider — polls wallet USDC + toast on incoming transfers. */
export function WalletBalanceEffects() {
  useWalletUsdcReceivedToast();
  return null;
}
