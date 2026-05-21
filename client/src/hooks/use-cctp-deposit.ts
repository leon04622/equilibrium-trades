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
import { hasEnoughArbitrumGasForBurn } from "@/lib/arbitrum-gas";
import {
  CLIENT_CCTP_DEPOSIT_DEFAULTS,
  clearCctpBridgeProgress,
  fetchHyperliquidDepositConfig,
  humanizeCctpDepositError,
  isCctpPostBurnResumeEligible,
  isLikelyMintConsumedError,
} from "@/lib/cctp-deposit";

export function useCctpDeposit() {
  const { toast } = useToast();
  const { address, signer, provider, chainId, switchToArbitrum } = useWallet();
  const {
    refreshAccount,
    refreshWalletUsdc,
    walletUsdcArbitrum,
    walletEthArbitrum,
    walletUsdcReady,
  } = useTrading();
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
  const autoResumeAttemptedRef = useRef(false);

  const bridgeProgress = userSync?.cctpBridgeProgress ?? null;
  const hasResumableDeposit = isCctpPostBurnResumeEligible(bridgeProgress);
  const isResumeOnly = hasResumableDeposit;
  const hasArbitrumGasForNewDeposit =
    isResumeOnly || hasEnoughArbitrumGasForBurn(walletEthArbitrum);

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
      const resumeAmt = bridgeProgress?.amountUsdc;
      if (hasResumableDeposit && resumeAmt != null && resumeAmt > 0) {
        setDepositAmount(resumeAmt.toFixed(2));
      } else {
        setDepositAmount(safeMax > 0 ? safeMax.toFixed(2) : "");
      }
      void refreshAccount({ silent: true });
    } catch (e: unknown) {
      setDepositCfg(CLIENT_CCTP_DEPOSIT_DEFAULTS);
      const msg = e instanceof Error ? e.message : "Could not refresh balances.";
      setDepositCfgLoadError(msg);
    } finally {
      setPreparing(false);
    }
  }, [address, bridgeProgress?.amountUsdc, hasResumableDeposit, refreshWalletUsdc, refreshAccount]);

  const resetDepositState = useCallback(() => {
    depositAbortRef.current?.abort();
    depositAbortRef.current = null;
    setDepositResult(null);
    setDepositStep("");
    setDepositAwaitingChain(false);
    cctpAttestationCelebratedRef.current = false;
    autoResumeAttemptedRef.current = false;
  }, []);

  const dismissStuckDeposit = useCallback(async () => {
    if (!address) return;
    await clearCctpBridgeProgress(address);
    void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
    resetDepositState();
    toast({
      title: "Deposit state cleared",
      description: "You can start a new deposit. Your trading balance was not changed by this action.",
    });
  }, [address, resetDepositState, toast]);

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
    if (!isResumeOnly && (isNaN(amount) || amount <= 0)) {
      setDepositStep("");
      setDepositResult({ success: false, error: "Enter a valid amount greater than 0." });
      return;
    }
    if (!isResumeOnly && amount < cfg.minDepositUsdc) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error: `Minimum deposit is ${cfg.minDepositUsdc} USDC.`,
      });
      return;
    }
    const maxDeposit = walletUsdcArbitrum ?? 0;
    if (!isResumeOnly && amount > maxDeposit + 0.001) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error: `Amount exceeds your Arbitrum USDC balance (${maxDeposit.toFixed(2)} USDC).`,
      });
      return;
    }

    if (!isResumeOnly && walletUsdcReady && !hasEnoughArbitrumGasForBurn(walletEthArbitrum)) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error:
          "Add a small amount of ETH on Arbitrum One to the same wallet that holds your USDC (for bridge gas). Trading USDC cannot pay this fee.",
      });
      toast({
        title: "ETH needed on Arbitrum",
        description: "Bridge or buy ~0.0002 ETH on Arbitrum in your connected wallet, then try again.",
        variant: "destructive",
      });
      return;
    }

    depositAbortRef.current?.abort();
    const abort = new AbortController();
    depositAbortRef.current = abort;

    setDepositing(true);
    setDepositAwaitingChain(false);
    setDepositStep(
      isResumeOnly
        ? "Finishing your deposit (no new Arbitrum sign)…"
        : "Fetching Circle CCTP forward fee quote...",
    );

    try {
      const depositAmountArg = isResumeOnly ? bridgeProgress?.amountUsdc ?? amount : amount;
      const result = await depositUsdcToHyperliquid(activeSigner, depositAmountArg, {
        depositConfig: cfg,
        hyperCoreRecipient: address ?? undefined,
        resumeFrom: hasResumableDeposit ? bridgeProgress : null,
        signal: abort.signal,
        onStep: (step: CctpDepositStep, detail?: string) => {
          if (step === "authorize" || step === "approve") {
            setDepositStep(
              "Step 1 of 2 — Authorize USDC (signature only, no gas). This is not a separate approval transaction.",
            );
          } else if (step === "burn") {
            setDepositAwaitingChain(true);
            setDepositStep("Step 2 of 2 — Confirm bridge transfer on Arbitrum (one transaction)…");
          } else if (step === "attestation") {
            setDepositAwaitingChain(true);
            setDepositStep(
              detail
                ? `Waiting for Circle attestation… ${detail.slice(0, 12)}…`
                : "Waiting for Circle attestation…",
            );
          } else if (step === "mint") {
            setDepositAwaitingChain(
              !detail?.includes("no wallet prompt"),
            );
            setDepositStep(
              detail ??
                "Finishing deposit — confirm on HyperEVM only if your wallet prompts (chain 999)…",
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
            description: cfg.relayMintEnabled
              ? "Finishing your deposit automatically…"
              : "Confirm the final mint in your wallet if prompted (HyperEVM).",
          });
        },
      });

      setDepositAwaitingChain(false);
      setDepositStep("");

      let success = result.success;
      let displayError = result.error ? humanizeCctpDepositError(result.error) : undefined;
      if (!success && result.error && isLikelyMintConsumedError(result.error)) {
        success = true;
        displayError = undefined;
      }
      setDepositResult(success ? { success: true, txHash: result.txHash } : { ...result, error: displayError });

      if (success) {
        autoResumeAttemptedRef.current = false;
        if (address) await clearCctpBridgeProgress(address);
        window.dispatchEvent(new Event("equilibrium-deposit-confirmed"));
        void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
        toast({
          title: isResumeOnly ? "Deposit complete" : "Added to trading",
          description: isResumeOnly
            ? "USDC is on your Hyperliquid balance — no further wallet steps."
            : `${depositAmountArg} USDC is on the way to your trading account.`,
        });
        void refreshAccount({ silent: true });
        void refreshWalletUsdc({ silent: true });
        setTimeout(() => void refreshAccount({ silent: true }), 5_000);
        setTimeout(() => void refreshAccount({ silent: true }), 15_000);
      } else {
        toast({
          title: hasResumableDeposit ? "Still finishing deposit" : "Deposit needs attention",
          description: displayError || "Deposit failed",
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const errMsg = humanizeCctpDepositError(
        err instanceof Error ? err.message : String(err) || "Deposit failed",
      );
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
    walletEthArbitrum,
    walletUsdcReady,
    bridgeProgress,
    hasResumableDeposit,
    isResumeOnly,
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
    isResumeOnly,
    hasArbitrumGasForNewDeposit,
    walletEthArbitrum,
    walletUsdcReady,
    prepareDeposit,
    resetDepositState,
    dismissStuckDeposit,
    cancelDeposit,
    runDeposit,
  };
}
