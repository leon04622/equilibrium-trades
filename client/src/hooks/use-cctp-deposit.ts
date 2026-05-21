import { useCallback, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/lib/wallet-context";
import { useTrading } from "@/lib/trading-context";
import { useUserSync } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import {
  depositUsdcToHyperliquid,
  type CctpDepositStep,
  type HyperliquidDepositConfig,
} from "@/lib/hyperliquid-client";
import {
  CLIENT_CCTP_DEPOSIT_DEFAULTS,
  fetchHyperliquidDepositConfig,
} from "@/lib/cctp-deposit";

export function useCctpDeposit() {
  const { toast } = useToast();
  const { address, signer, provider, chainId, switchToArbitrum } = useWallet();
  const { refreshAccount, refreshWalletUsdc, walletUsdcArbitrum } = useTrading();
  const { data: userSync } = useUserSync();

  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState("");
  const [depositAwaitingChain, setDepositAwaitingChain] = useState(false);
  const [depositResult, setDepositResult] = useState<{
    success: boolean;
    txHash?: string;
    error?: string;
  } | null>(null);
  const [depositCfg, setDepositCfg] = useState<HyperliquidDepositConfig | null>(CLIENT_CCTP_DEPOSIT_DEFAULTS);
  const [depositCfgLoadError, setDepositCfgLoadError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const cctpAttestationCelebratedRef = useRef(false);
  const depositAbortRef = useRef<AbortController | null>(null);

  const cctpResumeStage = userSync?.cctpBridgeProgress?.stage;
  const hasResumableDeposit =
    !!userSync?.cctpBridgeProgress &&
    cctpResumeStage !== "done" &&
    cctpResumeStage !== "completed" &&
    !String(cctpResumeStage).startsWith("failed") &&
    !String(cctpResumeStage).startsWith("error");

  const prepareDeposit = useCallback(async () => {
    if (!address) return;
    setPreparing(true);
    setDepositCfgLoadError(null);
    try {
      const [bal] = await Promise.all([
        refreshWalletUsdc({ silent: true }),
        fetchHyperliquidDepositConfig(false, { allowFallback: true }).then((cfg) => {
          setDepositCfg(cfg);
          setDepositCfgLoadError(null);
        }),
      ]);
      const safeMax = Math.floor(bal.native * 100) / 100;
      setDepositAmount(safeMax > 0 ? safeMax.toFixed(2) : "");
      void refreshAccount({ silent: true });
    } catch (e: unknown) {
      setDepositCfg(CLIENT_CCTP_DEPOSIT_DEFAULTS);
      const msg = e instanceof Error ? e.message : "Could not refresh balances.";
      setDepositCfgLoadError(msg);
    } finally {
      setPreparing(false);
    }
  }, [address, refreshWalletUsdc, refreshAccount]);

  const resetDepositState = useCallback(() => {
    depositAbortRef.current?.abort();
    depositAbortRef.current = null;
    setDepositResult(null);
    setDepositStep("");
    setDepositAwaitingChain(false);
    cctpAttestationCelebratedRef.current = false;
  }, []);

  const cancelDeposit = useCallback(() => {
    depositAbortRef.current?.abort();
    depositAbortRef.current = null;
    setDepositing(false);
    setDepositAwaitingChain(false);
    setDepositStep("");
    setDepositResult({
      success: false,
      error:
        "Paused. If you already signed the burn, wait 2–5 minutes and tap Add to trading again to finish (your USDC is safe).",
    });
  }, []);

  const runDeposit = useCallback(async () => {
    cctpAttestationCelebratedRef.current = false;
    setDepositStep("Checking wallet...");
    setDepositResult(null);

    if (!address) {
      setDepositStep("");
      setDepositResult({ success: false, error: "Connect your wallet first." });
      return;
    }

    const ARBITRUM_CHAIN_ID = 42161;
    if (chainId !== ARBITRUM_CHAIN_ID) {
      setDepositStep("Switching to Arbitrum...");
      try {
        await switchToArbitrum();
      } catch {
        setDepositStep("");
        setDepositResult({
          success: false,
          error: "Please switch your wallet to Arbitrum One and try again.",
        });
        return;
      }
    }

    let activeSigner = signer;
    if (!activeSigner) {
      setDepositStep("Reconnecting wallet signer...");
      try {
        if (provider) {
          activeSigner = await provider.getSigner();
        } else if (window.ethereum) {
          const { BrowserProvider } = await import("ethers");
          const freshProvider = new BrowserProvider(window.ethereum);
          activeSigner = await freshProvider.getSigner();
        }
      } catch (err: unknown) {
        console.error("[Deposit] Signer recovery failed:", err);
      }
    }

    if (!activeSigner) {
      const msg =
        "Wallet signer not available. Disconnect and reconnect your wallet, then try again.";
      setDepositStep("");
      setDepositResult({ success: false, error: msg });
      toast({ title: "Deposit Failed", description: msg, variant: "destructive" });
      return;
    }

    let cfg = depositCfg;
    if (!cfg) {
      setDepositStep("Loading deposit settings...");
      try {
        cfg = await fetchHyperliquidDepositConfig(true, { allowFallback: true });
        setDepositCfg(cfg);
        setDepositCfgLoadError(null);
      } catch {
        setDepositStep("");
        const msg =
          "Deposit is not configured on the server. Contact support or try again later.";
        setDepositResult({ success: false, error: msg });
        return;
      }
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositStep("");
      setDepositResult({ success: false, error: "Enter a valid amount greater than 0." });
      return;
    }
    if (amount < cfg.minDepositUsdc) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error: `Minimum deposit is ${cfg.minDepositUsdc} USDC.`,
      });
      return;
    }
    const maxDeposit = walletUsdcArbitrum ?? 0;
    if (amount > maxDeposit + 0.001) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error: `Amount exceeds your Arbitrum USDC balance (${maxDeposit.toFixed(2)} USDC).`,
      });
      return;
    }

    depositAbortRef.current?.abort();
    const abort = new AbortController();
    depositAbortRef.current = abort;

    setDepositing(true);
    setDepositAwaitingChain(false);
    setDepositStep("Fetching Circle CCTP forward fee quote...");

    try {
      const result = await depositUsdcToHyperliquid(activeSigner, amount, {
        depositConfig: cfg,
        hyperCoreRecipient: address ?? undefined,
        resumeFrom: hasResumableDeposit ? userSync?.cctpBridgeProgress ?? null : null,
        signal: abort.signal,
        onStep: (step: CctpDepositStep, detail?: string) => {
          if (step === "approve") {
            setDepositStep("Sign USDC authorization in your wallet...");
          } else if (step === "burn") {
            setDepositAwaitingChain(true);
            setDepositStep("Submitting CCTP burn on Arbitrum...");
          } else if (step === "attestation") {
            setDepositAwaitingChain(true);
            setDepositStep(
              detail
                ? `Waiting for Circle attestation… ${detail.slice(0, 12)}…`
                : "Waiting for Circle attestation…",
            );
          } else if (step === "mint") {
            setDepositAwaitingChain(true);
            setDepositStep(
              detail ?? "Confirm mint on HyperEVM to credit your trading account…",
            );
          } else if (step === "done") {
            setDepositAwaitingChain(false);
            setDepositStep("");
          }
        },
        onAttestationConfirmed: () => {
          cctpAttestationCelebratedRef.current = true;
          toast({
            title: "Attestation ready",
            description: "Confirm the mint in your wallet if prompted.",
          });
        },
      });

      setDepositAwaitingChain(false);
      setDepositStep("");
      setDepositResult(result);

      if (result.success) {
        window.dispatchEvent(new Event("equilibrium-deposit-confirmed"));
        void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
        if (!cctpAttestationCelebratedRef.current) {
          toast({
            title: "Deposit submitted",
            description: `${amount} USDC should appear on your trading account shortly.`,
          });
        }
        void refreshAccount({ silent: true });
        void refreshWalletUsdc({ silent: true });
        setTimeout(() => void refreshAccount({ silent: true }), 5_000);
        setTimeout(() => void refreshAccount({ silent: true }), 15_000);
      } else {
        toast({
          title: "Deposit Failed",
          description: result.error || "Deposit failed",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err) || "Deposit failed";
      setDepositAwaitingChain(false);
      setDepositStep("");
      setDepositResult({ success: false, error: errMsg });
      toast({ title: "Deposit Failed", description: errMsg, variant: "destructive" });
    } finally {
      depositAbortRef.current = null;
      setDepositing(false);
      setDepositAwaitingChain(false);
    }
  }, [
    address,
    chainId,
    switchToArbitrum,
    signer,
    provider,
    depositCfg,
    depositAmount,
    walletUsdcArbitrum,
    hasResumableDeposit,
    userSync?.cctpBridgeProgress,
    refreshAccount,
    refreshWalletUsdc,
    toast,
  ]);

  return {
    depositAmount,
    setDepositAmount,
    depositing,
    depositStep,
    depositAwaitingChain,
    depositResult,
    depositCfg,
    depositCfgLoadError,
    preparing,
    walletUsdcArbitrum,
    hasResumableDeposit,
    prepareDeposit,
    resetDepositState,
    cancelDeposit,
    runDeposit,
  };
}
