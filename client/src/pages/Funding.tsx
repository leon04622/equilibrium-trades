import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import {
  CLIENT_CCTP_DEPOSIT_DEFAULTS,
  fetchHyperliquidDepositConfig,
  humanizeCctpDepositError,
  isCctpPostBurnResumeEligible,
} from "@/lib/cctp-deposit";
import { DepositGasNotice } from "@/components/deposit-gas-notice";
import { ExternalDepositHelp } from "@/components/external-deposit-help";
import { hasEnoughArbitrumGasForBurn } from "@/lib/arbitrum-gas";
import { UnifiedBalanceCard } from "@/components/unified-balance-card";
import { useDepositSheet } from "@/lib/deposit-sheet-context";
import {
  depositUsdcToHyperliquid,
  ensureUnifiedAccountModeBeforeSpotToPerpTransfer,
  withdrawUsdcToWallet,
  type CctpDepositStep,
  type HyperliquidDepositConfig,
} from "@/lib/hyperliquid-client";
import {
  computeEffectiveWithdrawableUsdc,
  fetchUserAbstraction,
  isUnifiedStyleAbstraction,
  usesUnifiedUsdcPool,
  UNIFIED_WITHDRAW_HINT,
  type HlUserAbstraction,
} from "@/lib/hl-unified-funding";
import { queryClient } from "@/lib/queryClient";
import { StatePanel } from "@/components/state-panel";
import { PoweredByHyperliquid } from "@/components/powered-by-hyperliquid";
import { cn } from "@/lib/utils";
import { useUserSync } from "@/context/AuthContext";

type FundingTab = "deposit" | "withdraw";

function shortAddress(value: string | null): string {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function Funding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: FundingTab = requestedTab === "withdraw" ? "withdraw" : "deposit";

  const { toast } = useToast();
  const { openAddToTrading } = useDepositSheet();
  const { address, signer, provider, chainId, connect, switchToArbitrum } = useWallet();
  const {
    connected,
    withdrawable,
    accountValue,
    marginUsed,
    refreshAccount,
    walletUsdcArbitrum,
    walletUsdcBridged,
    walletEthArbitrum,
    displayTotalUsd,
    unifiedAccountUsd,
    spotUsdcAvailable,
    isLoadingWalletUsdc,
    refreshWalletUsdc,
  } = useTrading();
  const { data: userSync } = useUserSync();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState("");
  const [withdrawResult, setWithdrawResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState("");
  const [depositResult, setDepositResult] = useState<{ success: boolean; txHash?: string; error?: string } | null>(null);
  const arbUsdcBalance = walletUsdcArbitrum;
  const arbBridgedUsdcBalance = walletUsdcBridged;
  const isLoadingArbBalance = isLoadingWalletUsdc;
  const [depositAwaitingChain, setDepositAwaitingChain] = useState(false);
  const [depositCfg, setDepositCfg] = useState<HyperliquidDepositConfig | null>(CLIENT_CCTP_DEPOSIT_DEFAULTS);
  const [depositCfgLoadError, setDepositCfgLoadError] = useState<string | null>(null);
  const cctpAttestationCelebratedRef = useRef(false);

  const withdrawablePerp = withdrawable || 0;
  const [hlAbstraction, setHlAbstraction] = useState<HlUserAbstraction | null>(null);

  useEffect(() => {
    if (!address) {
      setHlAbstraction(null);
      return;
    }
    void fetchUserAbstraction(address).then(setHlAbstraction);
  }, [address]);

  const isUnifiedAccount = usesUnifiedUsdcPool({
    abstraction: hlAbstraction,
    spotUsdcAvailable: spotUsdcAvailable || 0,
    withdrawable: withdrawablePerp,
    accountValue: accountValue || 0,
  });
  const effectiveWithdrawable = useMemo(
    () =>
      computeEffectiveWithdrawableUsdc({
        withdrawable: withdrawablePerp,
        accountValue: accountValue || 0,
        marginUsed: marginUsed || 0,
        abstraction: hlAbstraction,
        spotUsdcAvailable: spotUsdcAvailable || 0,
      }),
    [withdrawablePerp, accountValue, marginUsed, hlAbstraction, spotUsdcAvailable],
  );

  const isOnArbitrum = chainId === 42161;
  const hasResumableDeposit = isCctpPostBurnResumeEligible(userSync?.cctpBridgeProgress);

  const setTab = (tab: FundingTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(6);
  };

  const refreshFundingData = useCallback(async () => {
    if (!address) {
      setDepositCfg(CLIENT_CCTP_DEPOSIT_DEFAULTS);
      setDepositCfgLoadError(null);
      return;
    }

    setDepositCfgLoadError(null);
    try {
      const [bal, cfg] = await Promise.all([
        refreshWalletUsdc({ silent: true }),
        fetchHyperliquidDepositConfig(false, { allowFallback: true }),
      ]);
      setDepositCfg(cfg);
      setDepositAmount((current) => {
        if (current.trim().length > 0) return current;
        const safeMax = Math.floor(bal.native * 100) / 100;
        return safeMax > 0 ? safeMax.toFixed(2) : "";
      });
      toast({ title: "Balances updated" });
    } catch (e: unknown) {
      setDepositCfg(CLIENT_CCTP_DEPOSIT_DEFAULTS);
      setDepositCfgLoadError(
        e instanceof Error ? e.message : "Could not refresh balances. Try again.",
      );
    }
  }, [address, refreshWalletUsdc, toast]);

  useEffect(() => {
    if (!address) return;
    if (!withdrawDest) setWithdrawDest(address);
  }, [address, withdrawDest]);

  useEffect(() => {
    if (!address) return;
    setDepositCfgLoadError(null);
    void fetchHyperliquidDepositConfig(false, { allowFallback: true })
      .then((cfg) => {
        setDepositCfg(cfg);
        setDepositCfgLoadError(null);
      })
      .catch((e: unknown) => {
        setDepositCfg(CLIENT_CCTP_DEPOSIT_DEFAULTS);
        setDepositCfgLoadError(
          e instanceof Error ? e.message : "Using default deposit settings.",
        );
      });
  }, [address]);

  useEffect(() => {
    if (!address || isLoadingWalletUsdc) return;
    setDepositAmount((current) => {
      if (current.trim().length > 0) return current;
      const safeMax = Math.floor(arbUsdcBalance * 100) / 100;
      return safeMax > 0 ? safeMax.toFixed(2) : "";
    });
  }, [address, isLoadingWalletUsdc, arbUsdcBalance]);

  useEffect(() => {
    if (searchParams.get("activate") !== "1") return;
    setTab("deposit");
    if (walletUsdcArbitrum >= 0.01) {
      openAddToTrading();
    }
    const next = new URLSearchParams(searchParams);
    next.delete("activate");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per activate=1 navigation
  }, [searchParams.get("activate")]);

  const fundingHealth = useMemo(
    () => [
      {
        label: "Total balance",
        value: isLoadingWalletUsdc ? "…" : `${formatPrice(displayTotalUsd)}`,
      },
      {
        label: "In wallet",
        value: isLoadingWalletUsdc ? "…" : `${formatPrice(arbUsdcBalance)} USDC`,
      },
      {
        label: "Trading",
        value: `${formatPrice(unifiedAccountUsd)} USDC`,
      },
    ],
    [displayTotalUsd, arbUsdcBalance, unifiedAccountUsd, isLoadingWalletUsdc],
  );

  const handleWithdraw = async () => {
    setWithdrawStep("Checking wallet connection...");
    setWithdrawResult(null);

    let activeSigner = signer;
    if (!activeSigner) {
      setWithdrawStep("Reconnecting wallet signer...");
      try {
        if (provider) {
          activeSigner = await provider.getSigner();
        } else if (window.ethereum) {
          const { BrowserProvider } = await import("ethers");
          const freshProvider = new BrowserProvider(window.ethereum);
          activeSigner = await freshProvider.getSigner();
        }
      } catch (err: any) {
        console.error("[Withdraw] Signer recovery failed:", err);
      }
    }

    if (!activeSigner) {
      const msg = "Wallet signer not available. Please disconnect and reconnect your wallet, then try again.";
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: msg });
      toast({ title: "Withdrawal Failed", description: msg, variant: "destructive" });
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: "Please enter a valid amount greater than 0." });
      return;
    }
    const maxWithdraw = computeEffectiveWithdrawableUsdc({
      withdrawable: withdrawablePerp,
      accountValue: accountValue || 0,
      marginUsed: marginUsed || 0,
      abstraction: hlAbstraction,
      spotUsdcAvailable: spotUsdcAvailable || 0,
    });
    if (amount > maxWithdraw) {
      setWithdrawStep("");
      setWithdrawResult({
        success: false,
        error: `Amount exceeds withdrawable balance of ${maxWithdraw.toFixed(2)} USDC.`,
      });
      return;
    }
    if (!withdrawDest || !/^0x[0-9a-fA-F]{40}$/.test(withdrawDest)) {
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: "Please enter a valid Arbitrum wallet address (0x...)." });
      return;
    }

    setWithdrawing(true);

    const abstractionMode =
      hlAbstraction ?? (address ? await fetchUserAbstraction(address) : null);
    if (abstractionMode && !isUnifiedStyleAbstraction(abstractionMode)) {
      setWithdrawStep("One-time setup: enabling unified USDC on Hyperliquid (same as app.hyperliquid)…");
      const prep = await ensureUnifiedAccountModeBeforeSpotToPerpTransfer(activeSigner);
      if (!prep.ok) {
        setWithdrawing(false);
        setWithdrawStep("");
        const msg = prep.error || "Unified account setup did not complete.";
        setWithdrawResult({ success: false, error: msg });
        toast({
          title: prep.userRejected ? "Setup cancelled" : "Account setup required",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      setHlAbstraction("unifiedAccount");
    }

    setWithdrawStep("Requesting signature from your wallet - check your wallet app...");

    try {
      const result = await withdrawUsdcToWallet(activeSigner, amount, withdrawDest);
      setWithdrawStep("");
      setWithdrawResult(result);

      if (result.success) {
        toast({
          title: "Withdrawal Submitted",
          description: `${amount} USDC withdrawal to ${withdrawDest.slice(0, 6)}...${withdrawDest.slice(-4)} is processing.`,
        });
        setTimeout(() => void refreshAccount(), 5_000);
        setTimeout(() => void refreshAccount(), 15_000);
      } else {
        toast({ title: "Withdrawal Failed", description: result.error || "Withdrawal failed", variant: "destructive" });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err) || "Withdrawal failed unexpectedly";
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: errMsg });
      toast({ title: "Withdrawal Failed", description: errMsg, variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDeposit = async () => {
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
        setDepositResult({ success: false, error: "Please switch your wallet to Arbitrum One and try again." });
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
      } catch (err: any) {
        console.error("[Deposit] Signer recovery failed:", err);
      }
    }

    if (!activeSigner) {
      const msg = "Wallet signer not available. Please disconnect and reconnect your wallet, then try again.";
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
          "Deposit is not configured. Set professional CCTP env vars on the server (TokenMessenger, forwarder, MessageTransmitter, USDC).";
        setDepositResult({ success: false, error: msg });
        return;
      }
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositStep("");
      setDepositResult({ success: false, error: "Please enter a valid amount greater than 0." });
      return;
    }
    if (amount < cfg.minDepositUsdc) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error: `The venue requires at least ${cfg.minDepositUsdc} USDC per deposit (smaller amounts are not credited).`,
      });
      return;
    }
    const maxDeposit = arbUsdcBalance ?? 0;
    if (amount > maxDeposit + 0.001) {
      setDepositStep("");
      setDepositResult({ success: false, error: `Amount exceeds your Arbitrum USDC balance of ${maxDeposit.toFixed(2)} USDC.` });
      return;
    }

    if (!hasResumableDeposit && !hasEnoughArbitrumGasForBurn(walletEthArbitrum)) {
      setDepositStep("");
      setDepositResult({
        success: false,
        error:
          "Add a small amount of ETH on Arbitrum One to this wallet for bridge gas. Trading USDC cannot pay this fee.",
      });
      toast({
        title: "ETH needed on Arbitrum",
        description: "Add ~0.0002 ETH on Arbitrum in your connected wallet, then try again.",
        variant: "destructive",
      });
      return;
    }

    setDepositing(true);
    setDepositAwaitingChain(false);
    setDepositStep("Fetching Circle CCTP forward fee quote...");

    try {
      const result = await depositUsdcToHyperliquid(activeSigner, amount, {
        depositConfig: cfg,
        hyperCoreRecipient: address ?? undefined,
        resumeFrom: hasResumableDeposit ? userSync?.cctpBridgeProgress ?? null : null,
        onStep: (step: CctpDepositStep, detail?: string) => {
          if (step === "authorize" || step === "approve") {
            setDepositStep("Step 1 of 2 — Authorize USDC (signature only, no gas)…");
          } else if (step === "burn") {
            setDepositAwaitingChain(true);
            setDepositStep("Step 2 of 2 — Confirm bridge on Arbitrum (one transaction)…");
          } else if (step === "attestation") {
            setDepositAwaitingChain(true);
            setDepositStep(
              detail
                ? `Waiting for Circle attestation… ${detail.slice(0, 12)}…`
                : "Waiting for Circle attestation (~1–5 min)…",
            );
          } else if (step === "mint") {
            setDepositAwaitingChain(!detail?.includes("no wallet prompt"));
            setDepositStep(
              detail ?? "Finishing deposit — confirm on HyperEVM only if your wallet prompts…",
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
      setDepositResult(
        result.success
          ? result
          : { ...result, error: result.error ? humanizeCctpDepositError(result.error) : result.error },
      );

      if (result.success) {
        window.dispatchEvent(new Event("equilibrium-deposit-confirmed"));
        void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
        if (!cctpAttestationCelebratedRef.current) {
          toast({
            title: "CCTP deposit complete",
            description: `Mint submitted on HyperEVM. ${amount} USDC (net of fees) should appear on HyperCore shortly - refresh balances if needed.`,
          });
        }
        void refreshAccount({ silent: true });
        void refreshWalletUsdc({ silent: true });
        setTimeout(() => void refreshAccount({ silent: true }), 5_000);
        setTimeout(() => void refreshAccount({ silent: true }), 15_000);
        setTimeout(() => void refreshAccount({ silent: true }), 45_000);
      } else {
        toast({ title: "Deposit Failed", description: result.error || "Deposit failed", variant: "destructive" });
      }
    } catch (err: unknown) {
      const errMsg = humanizeCctpDepositError(
        err instanceof Error ? err.message : String(err) || "Deposit failed unexpectedly",
      );
      setDepositAwaitingChain(false);
      setDepositStep("");
      setDepositResult({ success: false, error: errMsg });
      toast({ title: "Deposit Failed", description: errMsg, variant: "destructive" });
    } finally {
      setDepositing(false);
      setDepositAwaitingChain(false);
    }
  };

  if (!address) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
          <CardContent className="p-6 md:p-8">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Wallet className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold tracking-tight">Funding</h1>
                <Badge variant="secondary">Deposit + Withdraw</Badge>
                <PoweredByHyperliquid compact />
              </div>
              <p className="max-w-2xl text-muted-foreground">
                Deposit and withdraw from one funding screen without bouncing back to the dashboard.
              </p>
            </div>
          </CardContent>
        </Card>

        <StatePanel
          icon={<AlertCircle className="h-6 w-6" />}
          title="Connect a wallet to unlock funding controls"
          description="Once connected, you can deposit USDC from Arbitrum or withdraw to your wallet from the same page."
          actionLabel="Connect wallet"
          onAction={() => void connect()}
          className="border-dashed"
          contentClassName="min-h-[320px]"
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Wallet className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold tracking-tight">Funding</h1>
                <Badge variant="secondary">One page</Badge>
                <PoweredByHyperliquid compact />
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Send USDC to your wallet on <strong className="text-foreground">Arbitrum One</strong>, then press{" "}
                <strong className="text-foreground">Add to trading</strong> to move it into your Hyperliquid account.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:w-[460px]">
                {fundingHealth.map((item) => (
                  <div key={item.label} className="rounded-2xl border bg-background/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                    <p className="mt-2 text-base font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto shrink-0"
                onClick={() => openAddToTrading()}
                data-testid="button-funding-add-to-trading"
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Add to trading
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <UnifiedBalanceCard />

      <Tabs value={activeTab} onValueChange={(value) => setTab(value as FundingTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:w-[320px]" data-testid="tabs-funding">
          <TabsTrigger value="deposit" data-testid="tab-funding-deposit">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Deposit
          </TabsTrigger>
          <TabsTrigger value="withdraw" data-testid="tab-funding-withdraw">
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            Withdraw
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="space-y-4">
          <Card data-testid="card-funding-deposit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-primary" />
                Add funds to trading
              </CardTitle>
              <CardDescription>
                Move USDC from your Arbitrum wallet into Hyperliquid. You will sign a few steps in your wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p>
                      Connected wallet: <span className="font-medium text-foreground">{shortAddress(address)}</span>
                    </p>
                    <p>
                      Arbitrum USDC (native):{" "}
                      <span className="font-medium text-foreground">
                        {isLoadingArbBalance ? "Loading…" : `${formatPrice(arbUsdcBalance)} USDC`}
                      </span>
                    </p>
                    {!isLoadingArbBalance && (arbBridgedUsdcBalance ?? 0) > 0 ? (
                      <p>
                        Arbitrum USDC.e (bridged):{" "}
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {formatPrice(arbBridgedUsdcBalance!)} — swap to native before deposit
                        </span>
                      </p>
                    ) : null}
                    <p>
                      Minimum deposit:{" "}
                      <span className="font-medium text-foreground">
                        {depositCfg ? `${depositCfg.minDepositUsdc} USDC` : "--"}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void refreshFundingData()} data-testid="button-funding-refresh-deposit">
                      Refresh
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/guide/deposit">Guide</Link>
                    </Button>
                  </div>
                </div>
              </div>

              {hasResumableDeposit && userSync?.cctpBridgeProgress ? (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p>
                      <strong className="text-foreground">Resume available:</strong> saved bridge step{" "}
                      <span className="font-mono">{userSync.cctpBridgeProgress.stage}</span>
                      {userSync.cctpBridgeProgress.txHash ? (
                        <>
                          {" "}
                          · tx{" "}
                          <a
                            className="text-primary underline"
                            href={`https://arbiscan.io/tx/${userSync.cctpBridgeProgress.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {userSync.cctpBridgeProgress.txHash.slice(0, 10)}...
                          </a>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Press Deposit USDC to continue the saved deposit without leaving the platform.
                    </p>
                  </div>
                </div>
              ) : null}

              {depositCfgLoadError && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{depositCfgLoadError}</span>
                </div>
              )}

              <ExternalDepositHelp
                walletAddress={address}
                nativeUsdc={walletUsdcArbitrum}
                bridgedUsdc={walletUsdcBridged}
                minDepositUsdc={depositCfg?.minDepositUsdc ?? 5}
                isLoading={isLoadingArbBalance}
              />

              <DepositGasNotice
                walletAddress={address}
                ethBalance={walletEthArbitrum}
                isLoading={isLoadingArbBalance}
                resumeOnly={hasResumableDeposit}
                relayMintEnabled={depositCfg?.relayMintEnabled}
              />

              {!isOnArbitrum && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Your wallet is not on Arbitrum One. Deposit will prompt a network switch first.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="funding-deposit-amount">Amount (USDC)</Label>
                <div className="flex gap-2">
                  <Input
                    id="funding-deposit-amount"
                    inputMode="decimal"
                    placeholder="100.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    data-testid="input-funding-deposit-amount"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      const max = arbUsdcBalance ?? 0;
                      setDepositAmount((Math.floor(max * 100) / 100).toFixed(2));
                    }}
                    data-testid="button-funding-deposit-max"
                  >
                    Max
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  First deposit? 1 USDC may be used for account initialization on HyperCore.
                </p>
              </div>

              {depositCfg && (
                <div className="rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
                  <p>
                    Native USDC on Arbitrum One. Verified Bridge2 deposit contract reference on{" "}
                    <a
                      href={`https://arbiscan.io/address/${depositCfg.verifiedHyperliquidBridge2Arbitrum}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Arbiscan
                    </a>
                    .
                  </p>
                </div>
              )}

              {depositStep && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                  <Loader2 className={cn("mt-0.5 h-4 w-4 shrink-0", (depositing || depositAwaitingChain) && "animate-spin")} />
                  <div className="space-y-1">
                    <span>{depositStep}</span>
                    {depositAwaitingChain && <p className="text-xs text-primary/80">Leave this page open while the cross-chain steps finalize.</p>}
                  </div>
                </div>
              )}

              {depositResult && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-3 text-sm",
                    depositResult.success
                      ? "border-bullish/25 bg-bullish/10 text-bullish"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {depositResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>
                    {depositResult.success
                      ? `CCTP flow finished. ${depositAmount} USDC gross from Arbitrum - net reaches HyperCore after forward fee and any account fee.${depositResult.txHash ? ` Last tx: ${depositResult.txHash.slice(0, 10)}...` : ""}`
                      : depositResult.error || "Deposit failed"}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => openAddToTrading()}
                  type="button"
                  size="lg"
                  data-testid="button-funding-quick-deposit"
                >
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Add to trading (recommended)
                </Button>
                <Button
                  onClick={handleDeposit}
                  variant="outline"
                  disabled={
                    depositing ||
                    isLoadingArbBalance ||
                    (!hasResumableDeposit && !hasEnoughArbitrumGasForBurn(walletEthArbitrum)) ||
                    !depositAmount ||
                    parseFloat(depositAmount) <= 0 ||
                    parseFloat(depositAmount) > arbUsdcBalance + 0.001
                  }
                  data-testid="button-funding-deposit-confirm"
                >
                  {depositing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    "Deposit on this page"
                  )}
                </Button>
              </div>
              {isLoadingArbBalance && (
                <p className="text-xs text-muted-foreground">Loading wallet balance from Arbitrum…</p>
              )}
              {!isLoadingArbBalance && arbUsdcBalance < (depositCfg?.minDepositUsdc ?? 5) && (
                <p className="text-xs text-muted-foreground">
                  Send at least {depositCfg?.minDepositUsdc ?? 5} USDC to your wallet on Arbitrum, then refresh.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdraw" className="space-y-4">
          <Card data-testid="card-funding-withdraw">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpFromLine className="h-5 w-5 text-primary" />
                Withdraw USDC
              </CardTitle>
              <CardDescription>
                Send USDC from your Hyperliquid balance to your Arbitrum wallet (≈1 USDC fee, a few minutes).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isUnifiedAccount && (
                <p className="text-xs text-muted-foreground rounded-md border border-border/80 bg-muted/40 px-3 py-2 leading-relaxed">
                  {UNIFIED_WITHDRAW_HINT}
                </p>
              )}
              {!connected && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Your exchange account is still syncing. If withdrawable balance looks stale, refresh after reconnecting the trading session.</span>
                </div>
              )}

              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Withdrawable balance</span>
                  <span className="font-semibold">{formatPrice(effectiveWithdrawable)} USDC</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="funding-withdraw-amount">Amount (USDC)</Label>
                <div className="flex gap-2">
                  <Input
                    id="funding-withdraw-amount"
                    inputMode="decimal"
                    placeholder="50.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    data-testid="input-funding-withdraw-amount"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setWithdrawAmount((Math.floor(effectiveWithdrawable * 100) / 100).toFixed(2))}
                    data-testid="button-funding-withdraw-max"
                  >
                    Max
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="funding-withdraw-destination">Destination wallet</Label>
                <Input
                  id="funding-withdraw-destination"
                  placeholder="0x..."
                  value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  data-testid="input-funding-withdraw-destination"
                />
                <p className="text-xs text-muted-foreground">Use an Arbitrum-compatible wallet address.</p>
              </div>

              {withdrawStep && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                  <Loader2 className={cn("mt-0.5 h-4 w-4 shrink-0", withdrawing && "animate-spin")} />
                  <span>{withdrawStep}</span>
                </div>
              )}

              {withdrawResult && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border p-3 text-sm",
                    withdrawResult.success
                      ? "border-bullish/25 bg-bullish/10 text-bullish"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {withdrawResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{withdrawResult.success ? "Withdrawal submitted successfully." : withdrawResult.error || "Withdrawal failed"}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleWithdraw}
                  disabled={
                    !withdrawAmount ||
                    parseFloat(withdrawAmount) <= 0 ||
                    withdrawing ||
                    effectiveWithdrawable <= 0
                  }
                  data-testid="button-funding-withdraw-confirm"
                >
                  {withdrawing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Withdrawing...
                    </>
                  ) : (
                    "Withdraw USDC"
                  )}
                </Button>
                <Button variant="outline" onClick={() => void refreshAccount()} data-testid="button-funding-refresh-withdraw">
                  Refresh balance
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-muted/30">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-foreground">Need the exact wallet flow?</p>
            <p>Use the deposit guide for the step-by-step pictures, or open portfolio for the wider account view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/guide/deposit">
                Deposit guide
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/portfolio">Portfolio</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
