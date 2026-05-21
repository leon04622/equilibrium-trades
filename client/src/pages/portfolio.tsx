import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight,
  DollarSign,
  Percent,
  BarChart3,
  RefreshCw,
  AlertCircle,
  Coins,
  ArrowRightLeft,
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowUpFromLine,
  ArrowDownToLine,
  Info,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import {
  getSpotBalances,
  transferUsdcBetweenAccounts,
  ensureUnifiedAccountModeBeforeSpotToPerpTransfer,
  withdrawUsdcToWallet,
  depositUsdcToHyperliquid,
  getArbitrumUsdcBalance,
  fetchHyperliquidDepositConfig,
  type HyperliquidDepositConfig,
  type CctpDepositStep,
  type SpotBalance,
} from "@/lib/hyperliquid-client";
import { queryClient } from "@/lib/queryClient";
import { getArbitrumBridgedUsdcBalance } from "@/lib/arbitrum-usdc";
import { ExternalDepositHelp } from "@/components/external-deposit-help";
import { UnifiedBalanceCard } from "@/components/unified-balance-card";
import { useDepositSheet } from "@/lib/deposit-sheet-context";
import { Progress } from "@/components/ui/progress";
import { Link, useSearchParams } from "react-router-dom";
import { useUserSync } from "@/context/AuthContext";
import { StatePanel } from "@/components/state-panel";
import { PoweredByHyperliquid } from "@/components/powered-by-hyperliquid";

export default function Portfolio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openAddToTrading } = useDepositSheet();
  const { 
    connected, 
    positions, 
    accountValue,
    marginUsed,
    balance,
    withdrawable,
    currentPrices,
    refreshAccount,
    displayTotalUsd,
    unifiedAccountUsd,
    walletUsdcArbitrum,
    walletUsdcBridged,
    isLoadingWalletUsdc,
  } = useTrading();
  const { address, signer, provider, chainId, switchToArbitrum } = useWallet();
  const { data: userSync } = useUserSync();
  const { toast } = useToast();
  const [spotBalances, setSpotBalances] = useState<SpotBalance[]>([]);
  const [isLoadingSpot, setIsLoadingSpot] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToPerp, setTransferToPerp] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferStep, setTransferStep] = useState<string>("");
  const [transferResult, setTransferResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<string>("");
  const [withdrawResult, setWithdrawResult] = useState<{ success: boolean; error?: string } | null>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositStep, setDepositStep] = useState<string>("");
  const [depositResult, setDepositResult] = useState<{ success: boolean; txHash?: string; error?: string } | null>(null);
  const [arbUsdcBalance, setArbUsdcBalance] = useState<number | null>(null);
  const [arbBridgedUsdcBalance, setArbBridgedUsdcBalance] = useState<number | null>(null);
  const [isLoadingArbBalance, setIsLoadingArbBalance] = useState(false);
  const [depositAwaitingChain, setDepositAwaitingChain] = useState(false);
  const [depositCfg, setDepositCfg] = useState<HyperliquidDepositConfig | null>(null);
  const [depositCfgLoadError, setDepositCfgLoadError] = useState<string | null>(null);
  const cctpAttestationCelebratedRef = useRef(false);

  const totalEquity =
    displayTotalUsd > 0 ? displayTotalUsd : (accountValue || 0) + walletUsdcArbitrum;
  const hlTradingUsd = unifiedAccountUsd > 0 ? unifiedAccountUsd : accountValue || 0;
  const availableBalance = balance || 0;
  const withdrawablePerp = withdrawable || 0;
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalMarginUsed = marginUsed || 0;

  const usdcSpotBalance = spotBalances.find(b => b.coin === "USDC");
  const usdcSpotAvailable = usdcSpotBalance
    ? parseFloat(usdcSpotBalance.total) - parseFloat(usdcSpotBalance.hold)
    : 0;

  const fetchSpotBalances = async () => {
    if (!address) return;
    setIsLoadingSpot(true);
    try {
      const balances = await getSpotBalances(address);
      setSpotBalances(balances);
    } catch (error) {
      console.error("Error fetching spot balances:", error);
    } finally {
      setIsLoadingSpot(false);
    }
  };

  useEffect(() => {
    if (connected && address) {
      fetchSpotBalances();
      void refreshAccount({ silent: true });
    }
  }, [connected, address, refreshAccount]);

  // Auto-refresh spot balances every 15 seconds when connected
  useEffect(() => {
    if (!connected || !address) return;
    const interval = setInterval(fetchSpotBalances, 15000);
    return () => clearInterval(interval);
  }, [connected, address]);

  const handleRefresh = () => {
    refreshAccount();
    fetchSpotBalances();
  };

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(6);
  };

  const formatPnl = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const maxTransferAmount = transferToPerp ? usdcSpotAvailable : withdrawablePerp;

  const openTransferDialog = (preferToPerp: boolean) => {
    // Smart direction: if the preferred direction has no funds, switch to the other direction
    let toPerp = preferToPerp;
    if (preferToPerp && usdcSpotAvailable <= 0 && withdrawablePerp > 0) {
      toPerp = false; // No spot USDC, but has perp balance — switch to Perp→Spot
    } else if (!preferToPerp && withdrawablePerp <= 0 && usdcSpotAvailable > 0) {
      toPerp = true; // No perp balance, but has spot USDC — switch to Spot→Perp
    }
    const max = toPerp ? usdcSpotAvailable : withdrawablePerp;
    // Floor to 2 decimal places so the amount never exceeds the actual available balance
    const safeMax = Math.floor(max * 100) / 100;
    setTransferToPerp(toPerp);
    setTransferAmount(safeMax > 0 ? safeMax.toFixed(2) : "");
    setTransferResult(null);
    setTransferStep("");
    setTransferOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("transfer") === "1" && connected) {
      openTransferDialog(true);
      const next = new URLSearchParams(searchParams);
      next.delete("transfer");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, connected, setSearchParams]);

  const handleTransfer = async () => {
    console.log("[Transfer] handleTransfer called — signer:", !!signer, "address:", address, "provider:", !!provider);
    setTransferStep("Checking wallet connection...");
    setTransferResult(null);

    // Step 1: Get a valid signer — recover from provider if stored signer is null
    let activeSigner = signer;
    if (!activeSigner) {
      console.warn("[Transfer] signer is null, attempting to recover...");
      setTransferStep("Reconnecting wallet signer...");
      try {
        if (provider) {
          activeSigner = await provider.getSigner();
          console.log("[Transfer] Recovered signer from provider");
        } else if (window.ethereum) {
          const { BrowserProvider } = await import("ethers");
          const freshProvider = new BrowserProvider(window.ethereum);
          activeSigner = await freshProvider.getSigner();
          console.log("[Transfer] Recovered signer from window.ethereum");
        }
      } catch (err: any) {
        console.error("[Transfer] Signer recovery failed:", err);
      }
    }

    if (!activeSigner) {
      const msg = "Wallet signer not available. Please disconnect and reconnect your wallet on the Exchange page, then try again.";
      console.error("[Transfer]", msg);
      setTransferStep("");
      setTransferResult({ success: false, error: msg });
      toast({ title: "Transfer Failed", description: msg, variant: "destructive" });
      return;
    }

    // Step 2: Validate amount
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      const msg = "Please enter a valid amount greater than 0.";
      setTransferStep("");
      setTransferResult({ success: false, error: msg });
      return;
    }
    if (amount > maxTransferAmount) {
      const msg = `Amount exceeds available balance of ${maxTransferAmount.toFixed(2)} USDC.`;
      setTransferStep("");
      setTransferResult({ success: false, error: msg });
      return;
    }

    // Step 3: Spot → Perp — align with Hyperliquid unified USDC (official app default) once per wallet
    if (transferToPerp) {
      setTransferring(true);
      setTransferStep("One-time Hyperliquid setup: enabling unified USDC balance (same as app.hyperliquid)…");
      const prep = await ensureUnifiedAccountModeBeforeSpotToPerpTransfer(activeSigner);
      if (!prep.ok) {
        setTransferring(false);
        setTransferStep("");
        const msg = prep.error || "Unified account setup did not complete.";
        setTransferResult({ success: false, error: msg });
        toast({
          title: prep.userRejected ? "Setup cancelled" : "Unified account setup failed",
          description: msg,
          variant: "destructive",
        });
        return;
      }
    }

    // Step 4: Execute transfer
    setTransferring(true);
    setTransferStep("Requesting signature from your wallet — check MetaMask/your wallet app...");
    console.log(`[Transfer] Calling transferUsdcBetweenAccounts: ${amount} USDC, toPerp=${transferToPerp}`);

    try {
      const result = await transferUsdcBetweenAccounts(activeSigner, amount, transferToPerp);
      console.log("[Transfer] Result:", result);
      setTransferStep("");
      setTransferResult(result);

      if (result.success) {
        toast({ title: "Transfer Successful", description: `${amount} USDC moved to ${transferToPerp ? "Perp" : "Spot"} account.` });
        setTimeout(() => {
          setTransferOpen(false);
          handleRefresh();
        }, 2000);
        // Second refresh after 5s to catch slower API propagation
        setTimeout(() => handleRefresh(), 5000);
        // Third refresh after 10s for final confirmation
        setTimeout(() => handleRefresh(), 10000);
      } else {
        const errMsg = result.error || "Transfer failed";
        console.error("[Transfer] API error:", errMsg);
        toast({ title: "Transfer Failed", description: errMsg, variant: "destructive" });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err) || "Transfer failed unexpectedly";
      console.error("[Transfer] Exception:", errMsg);
      setTransferStep("");
      setTransferResult({ success: false, error: errMsg });
      toast({ title: "Transfer Failed", description: errMsg, variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  };

  const openWithdrawDialog = () => {
    const safeMax = Math.floor(withdrawablePerp * 100) / 100;
    setWithdrawAmount(safeMax > 0 ? safeMax.toFixed(2) : "");
    setWithdrawDest(address || "");
    setWithdrawResult(null);
    setWithdrawStep("");
    setWithdrawOpen(true);
  };

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
    if (amount > withdrawablePerp) {
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: `Amount exceeds withdrawable balance of ${withdrawablePerp.toFixed(2)} USDC.` });
      return;
    }
    if (!withdrawDest || !/^0x[0-9a-fA-F]{40}$/.test(withdrawDest)) {
      setWithdrawStep("");
      setWithdrawResult({ success: false, error: "Please enter a valid Arbitrum wallet address (0x...)." });
      return;
    }

    setWithdrawing(true);
    setWithdrawStep("Requesting signature from your wallet — check MetaMask/your wallet app...");

    try {
      const result = await withdrawUsdcToWallet(activeSigner, amount, withdrawDest);
      setWithdrawStep("");
      setWithdrawResult(result);

      if (result.success) {
        toast({ title: "Withdrawal Submitted", description: `${amount} USDC withdrawal to ${withdrawDest.slice(0, 6)}...${withdrawDest.slice(-4)} is processing.` });
        setTimeout(() => handleRefresh(), 5000);
        setTimeout(() => handleRefresh(), 15000);
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

  const openDepositDialog = async () => {
    cctpAttestationCelebratedRef.current = false;
    setDepositAmount("");
    setDepositResult(null);
    setDepositStep("");
    setDepositCfg(null);
    setDepositCfgLoadError(null);
    setDepositOpen(true);
    if (!address) return;
    setIsLoadingArbBalance(true);
    try {
      const cfg = await fetchHyperliquidDepositConfig();
      setDepositCfg(cfg);
      const [bal, bridged] = await Promise.all([
        getArbitrumUsdcBalance(address, cfg.usdc),
        getArbitrumBridgedUsdcBalance(address),
      ]);
      setArbUsdcBalance(bal);
      setArbBridgedUsdcBalance(bridged);
      const safeMax = Math.floor(bal * 100) / 100;
      setDepositAmount(safeMax > 0 ? safeMax.toFixed(2) : "");
    } catch (e: any) {
      setDepositCfgLoadError(e?.message || "Could not load deposit settings from the server.");
      setArbUsdcBalance(null);
      setArbBridgedUsdcBalance(null);
    } finally {
      setIsLoadingArbBalance(false);
    }
  };

  const handleDeposit = async () => {
    setDepositStep("Checking wallet...");
    setDepositResult(null);

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
      setDepositStep("Loading deposit settings…");
      try {
        cfg = await fetchHyperliquidDepositConfig(true);
        setDepositCfg(cfg);
        setDepositCfgLoadError(null);
      } catch (e: any) {
        setDepositStep("");
        const msg =
          e?.message ||
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

    setDepositing(true);
    setDepositAwaitingChain(false);
    setDepositStep("Fetching Circle CCTP forward fee quote…");

    try {
      const resumeStage = userSync?.cctpBridgeProgress?.stage;
      const isResumableDeposit =
        !!userSync?.cctpBridgeProgress &&
        resumeStage !== "done" &&
        resumeStage !== "completed" &&
        !String(resumeStage).startsWith("failed") &&
        !String(resumeStage).startsWith("error");
      const result = await depositUsdcToHyperliquid(activeSigner, amount, {
        depositConfig: cfg,
        hyperCoreRecipient: address ?? undefined,
        resumeFrom: isResumableDeposit ? userSync?.cctpBridgeProgress ?? null : null,
        onStep: (step: CctpDepositStep, detail?: string) => {
          if (step === "approve") setDepositStep("Sign USDC authorization for Circle CCTP extension…");
          else if (step === "burn") {
            setDepositAwaitingChain(true);
            setDepositStep("Submit Circle CCTP burn on Arbitrum via CCTP extension…");
          } else if (step === "attestation") {
            setDepositAwaitingChain(true);
            setDepositStep(
              detail
                ? `Waiting for Circle attestation (Iris)… ${detail.slice(0, 12)}…`
                : "Waiting for Circle attestation (Iris)…",
            );
          } else if (step === "mint") {
            setDepositAwaitingChain(true);
            setDepositStep(detail ?? "Switch to HyperEVM (999) and confirm mint — forwarder credits HyperCore…");
          } else if (step === "done") {
            setDepositAwaitingChain(false);
            setDepositStep("");
          }
        },
        onAttestationConfirmed: () => {
          cctpAttestationCelebratedRef.current = true;
          void (async () => {
            try {
              const confetti = (await import("canvas-confetti")).default;
              const burst = { particleCount: 100, spread: 68, origin: { y: 0.65 } as const };
              void confetti(burst);
              void confetti({ ...burst, angle: 55, origin: { x: 0, y: 0.65 } });
              void confetti({ ...burst, angle: 125, origin: { x: 1, y: 0.65 } });
            } catch {
              /* optional dependency / dynamic import */
            }
            toast({
              title: "Success: Funds are now live in your trading account",
              description:
                "Circle attestation is ready. If your wallet asks, confirm the mint on HyperEVM to finalize delivery to HyperCore.",
            });
          })();
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
            title: "CCTP deposit complete",
            description: `Mint submitted on HyperEVM. ${amount} USDC (net of fees) should appear on HyperCore shortly — refresh balances if needed.`,
          });
        }
        handleRefresh();
        setTimeout(() => handleRefresh(), 5_000);
        setTimeout(() => handleRefresh(), 15_000);
        setTimeout(() => handleRefresh(), 45_000);
      } else {
        toast({ title: "Deposit Failed", description: result.error || "Deposit failed", variant: "destructive" });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err) || "Deposit failed unexpectedly";
      setDepositAwaitingChain(false);
      setDepositStep("");
      setDepositResult({ success: false, error: errMsg });
      toast({ title: "Deposit Failed", description: errMsg, variant: "destructive" });
    } finally {
      setDepositing(false);
      setDepositAwaitingChain(false);
    }
  };

  if (!connected) {
    return (
      <div className="p-6 space-y-6">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
          <CardContent className="p-6 md:p-8">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Wallet className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold tracking-tight">Portfolio</h1>
                <PoweredByHyperliquid compact />
              </div>
              <p className="max-w-2xl text-muted-foreground">
                Manage balances, funding movement, and account health from one calmer operations view.
              </p>
            </div>
          </CardContent>
        </Card>

        <StatePanel
          icon={<AlertCircle className="h-6 w-6" />}
          title="Connect a wallet to unlock portfolio controls"
          description="Once connected, you can review balances, transfer between spot and perp, and manage deposits or withdrawals without leaving the platform."
          actionLabel="Open home and connect"
          onAction={() => (window.location.href = "/")}
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
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Wallet className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold tracking-tight">Portfolio</h1>
                <PoweredByHyperliquid compact />
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                A cleaner operations view for balances, margin, transfers, and capital movement on the connected exchange.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:w-[360px]">
              <div className="rounded-2xl border bg-background/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Unified capital</p>
                <p className="mt-2 text-2xl font-display font-bold">${formatPrice(totalEquity)}</p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Open positions</p>
                <p className="mt-2 text-2xl font-display font-bold">{positions.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <UnifiedBalanceCard />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-portfolio" className="h-8 px-2 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openTransferDialog(true)}
            data-testid="button-transfer-funds"
            className="h-8 px-2 text-xs"
          >
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            Transfer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={walletUsdcArbitrum >= 0.01 ? openAddToTrading : openDepositDialog}
            data-testid="button-deposit"
            className="h-8 px-2 text-xs"
          >
            <ArrowDownToLine className="h-3 w-3 mr-1" />
            {walletUsdcArbitrum >= 0.01 ? "Add to trading" : "Deposit"}
          </Button>
          <Button
            size="sm"
            onClick={openWithdrawDialog}
            data-testid="button-withdraw"
            className="h-8 px-2 text-xs"
          >
            <ArrowUpFromLine className="h-3 w-3 mr-1" />
            Withdraw
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Card data-testid="card-total-equity">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(totalEquity)}</div>
            <p className="text-xs text-muted-foreground">Wallet + Hyperliquid</p>
          </CardContent>
        </Card>

        <Card data-testid="card-wallet-usdc">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet USDC</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingWalletUsdc ? "…" : `$${formatPrice(walletUsdcArbitrum)}`}
            </div>
            <p className="text-xs text-muted-foreground">Arbitrum (not yet trading)</p>
            {walletUsdcArbitrum >= 0.01 && (
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 mt-1 text-xs text-primary"
                onClick={openAddToTrading}
              >
                Add to trading →
              </Button>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-hl-trading">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">HL Trading</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(hlTradingUsd)}</div>
            <p className="text-xs text-muted-foreground">Perp + spot on exchange</p>
          </CardContent>
        </Card>

        <Card data-testid="card-available-balance">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Perp Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(availableBalance)}</div>
            <p className="text-xs text-muted-foreground">Free for trading</p>
          </CardContent>
        </Card>

        <Card data-testid="card-unrealized-pnl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unrealized PnL</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              totalUnrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
            )}>
              {formatPnl(totalUnrealizedPnl)}
            </div>
            <div className="flex items-center gap-1">
              {totalUnrealizedPnl >= 0 ? (
                <ArrowUpRight className="h-3 w-3 text-bullish" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-bearish" />
              )}
              <span className={cn(
                "text-xs",
                totalUnrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {totalEquity > 0 ? ((totalUnrealizedPnl / totalEquity) * 100).toFixed(2) : "0.00"}% of equity
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-margin-used">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margin Used</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(totalMarginUsed)}</div>
            <p className="text-xs text-muted-foreground">
              {totalEquity > 0 ? ((totalMarginUsed / totalEquity) * 100).toFixed(1) : "0.0"}% of equity
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="perp" className="space-y-4">
        <TabsList data-testid="tabs-portfolio">
          <TabsTrigger value="perp" data-testid="tab-perpetuals">
            Perpetuals ({positions.length})
          </TabsTrigger>
          <TabsTrigger value="spot" data-testid="tab-spot">
            Spot Holdings ({spotBalances.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Open Positions</CardTitle>
              <CardDescription>Your active perpetual futures positions</CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No open positions</p>
                  <p className="text-sm">Start trading to see your positions here</p>
                  <Link to="/trading">
                    <Button variant="outline" className="mt-4" data-testid="button-go-trading">
                      Go to Trading
                    </Button>
                  </Link>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {positions.map((position, index) => {
                      const markPrice = currentPrices[position.coin] || position.markPrice || position.entryPrice;
                      const roe = position.margin > 0 ? (position.unrealizedPnl / position.margin) * 100 : 0;
                      
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`position-${position.coin}`}
                        >
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{position.coin}-PERP</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    position.side === "long"
                                      ? "bg-bullish/15 text-bullish border-bullish/30"
                                      : "bg-bearish/15 text-bearish border-bearish/30"
                                  )}
                                >
                                  {position.side === "long" ? (
                                    <TrendingUp className="h-3 w-3 mr-1" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3 mr-1" />
                                  )}
                                  {position.side.toUpperCase()} {position.leverage}x
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Size: {position.size} | Entry: ${formatPrice(position.entryPrice)}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className={cn(
                              "font-semibold",
                              position.unrealizedPnl >= 0 ? "text-bullish" : "text-bearish"
                            )}>
                              {formatPnl(position.unrealizedPnl)}
                              <span className="text-xs ml-1">
                                ({roe >= 0 ? "+" : ""}{roe.toFixed(2)}%)
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Mark: ${formatPrice(markPrice)}
                            </div>
                            {position.liquidationPrice > 0 && (
                              <div className="text-xs text-orange-500">
                                Liq: ${formatPrice(position.liquidationPrice)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Link to={`/trading?coin=${position.coin}`}>
                              <Button variant="outline" size="sm" data-testid={`button-trade-${position.coin}`}>
                                Trade
                              </Button>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spot" className="space-y-4">
          {usdcSpotBalance && usdcSpotAvailable > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">You have {formatPrice(usdcSpotAvailable)} USDC in your Spot account</p>
                    <p className="text-xs text-muted-foreground">Transfer to your Perp account to start trading perpetuals</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => openTransferDialog(true)}
                  data-testid="button-transfer-spot-to-perp-banner"
                >
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Move to Perp
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spot Holdings</CardTitle>
              <CardDescription>Your spot token balances</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSpot ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50 animate-spin" />
                  <p>Loading spot balances...</p>
                </div>
              ) : spotBalances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No spot holdings</p>
                  <p className="text-sm">Transfer USDC from your perp account to see spot balances here</p>
                  <Button variant="outline" className="mt-4" data-testid="button-deposit-spot" onClick={() => openTransferDialog(false)}>
                    Transfer to Spot
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {spotBalances.map((balance, index) => {
                      const total = parseFloat(balance.total);
                      const hold = parseFloat(balance.hold);
                      const available = total - hold;
                      const isUsdc = balance.coin === "USDC";
                      
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`spot-${balance.coin}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                              <Coins className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{balance.coin}</span>
                                <Badge variant="secondary">Spot</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Available: {formatPrice(available)} {balance.coin}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-semibold">
                              {formatPrice(total)} {balance.coin}
                            </div>
                            {hold > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {formatPrice(hold)} in orders
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isUsdc ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openTransferDialog(true)}
                                data-testid={`button-transfer-spot-${balance.coin}`}
                              >
                                <ArrowRightLeft className="h-3 w-3 mr-1" />
                                Transfer to Perp
                              </Button>
                            ) : (
                              <Link to={`/trading?coin=${balance.coin}`}>
                                <Button variant="outline" size="sm" data-testid={`button-trade-spot-${balance.coin}`}>
                                  Trade
                                </Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-muted/30">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">
              Connected to Exchange Mainnet
            </span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-transfer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              Transfer USDC
            </DialogTitle>
            <DialogDescription>
              Move USDC between your Spot and Perp accounts. Your funds stay in your wallet — no custody involved.
            </DialogDescription>
            {transferToPerp && (
              <p className="text-xs text-muted-foreground rounded-md border border-border/80 bg-muted/40 px-3 py-2 leading-relaxed">
                The first time you move <strong className="text-foreground">Spot → Perp</strong> from this device,
                Equilibrium applies Hyperliquid’s <strong className="text-foreground">unified account</strong>{" "}
                (recommended by Hyperliquid — single USDC pool for spot and perp margin), so you do not need to change
                HIP-3 or account mode manually on the HL website.
              </p>
            )}
          </DialogHeader>

          {!signer && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Wallet signing not available. Please go to the Exchange page, disconnect and reconnect your wallet, then return here to transfer.</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex-1 text-center">
                <p className="font-medium">{transferToPerp ? "Spot Account" : "Perp Account"}</p>
                <p className="text-xs text-muted-foreground">
                  {transferToPerp
                    ? `${formatPrice(usdcSpotAvailable)} USDC available`
                    : `${formatPrice(withdrawablePerp)} USDC available`}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 text-center">
                <p className="font-medium">{transferToPerp ? "Perp Account" : "Spot Account"}</p>
                <p className="text-xs text-muted-foreground">Trading margin</p>
              </div>
            </div>

            <div className="flex gap-2 text-xs">
              <button
                className={cn(
                  "flex-1 py-1.5 rounded border text-center transition-colors",
                  transferToPerp
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary"
                )}
                onClick={() => {
                  setTransferToPerp(true);
                  const safeAmt = Math.floor(usdcSpotAvailable * 100) / 100;
                  setTransferAmount(safeAmt > 0 ? safeAmt.toFixed(2) : "");
                  setTransferResult(null);
                }}
                data-testid="button-direction-to-perp"
              >
                Spot → Perp
              </button>
              <button
                className={cn(
                  "flex-1 py-1.5 rounded border text-center transition-colors",
                  !transferToPerp
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary"
                )}
                onClick={() => {
                  setTransferToPerp(false);
                  const safeAmt = Math.floor(withdrawablePerp * 100) / 100;
                  setTransferAmount(safeAmt > 0 ? safeAmt.toFixed(2) : "");
                  setTransferResult(null);
                }}
                data-testid="button-direction-to-spot"
              >
                Perp → Spot
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transfer-amount">Amount (USDC)</Label>
              <div className="flex gap-2">
                <Input
                  id="transfer-amount"
                  type="number"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-transfer-amount"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setTransferAmount((Math.floor(maxTransferAmount * 100) / 100).toFixed(2))}
                  data-testid="button-transfer-max"
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {formatPrice(maxTransferAmount)} USDC
              </p>
              {maxTransferAmount <= 0 && (
                <p className="text-xs text-amber-500 mt-1">
                  {transferToPerp
                    ? "No USDC in Spot account. Try switching to Perp → Spot if you have funds in your Perp account."
                    : "No withdrawable USDC in Perp account. Deposit funds to your account first."}
                </p>
              )}
            </div>

            {transferStep && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-primary/10 text-primary border border-primary/20">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{transferStep}</span>
              </div>
            )}

            {transferResult && (
              <div className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm font-medium",
                transferResult.success
                  ? "bg-bullish/10 text-bullish border border-bullish/20"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              )}>
                {transferResult.success ? (
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span className="break-all">
                  {transferResult.success
                    ? `Successfully transferred ${transferAmount} USDC to ${transferToPerp ? "Perp" : "Spot"} account!`
                    : transferResult.error || "Transfer failed"}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)} data-testid="button-transfer-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferring || !transferAmount || parseFloat(transferAmount) <= 0 || parseFloat(transferAmount) > maxTransferAmount}
              data-testid="button-transfer-confirm"
            >
              {transferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transfer USDC
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deposit Dialog ── */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-deposit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-primary" />
              Deposit USDC to Your Account
            </DialogTitle>
            <DialogDescription>
              <strong>Circle CCTP (professional):</strong> you approve USDC, then{" "}
              <code className="text-xs bg-muted px-1 rounded">depositForBurnWithHook</code> on Arbitrum burns USDC and attaches{" "}
              <strong>forward hook data</strong> for the <strong>CctpForwarder</strong> on HyperEVM, so minted USDC is
              credited to your <strong>HyperCore</strong> trading account (not stranded on HyperEVM). After Circle Iris attests,
              you confirm <code className="text-xs bg-muted px-1 rounded">receiveMessage</code> on HyperEVM. Minimum{" "}
              {depositCfg ? `${depositCfg.minDepositUsdc}` : "—"} USDC. Forward fee is quoted live from Circle.
            </DialogDescription>
          </DialogHeader>

          {userSync?.cctpBridgeProgress &&
            userSync.cctpBridgeProgress.stage !== "done" &&
            userSync.cctpBridgeProgress.stage !== "completed" &&
            !String(userSync.cctpBridgeProgress.stage).startsWith("failed") &&
            !String(userSync.cctpBridgeProgress.stage).startsWith("error") && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-xs bg-muted/60 border border-border">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Resume:</strong> last bridge step saved:{" "}
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
                        {userSync.cctpBridgeProgress.txHash.slice(0, 10)}…
                      </a>
                    </>
                  ) : null}
                  . Press Deposit USDC to resume from the saved bridge step.
                </span>
              </div>
            )}

          {depositCfgLoadError && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{depositCfgLoadError}</span>
            </div>
          )}

          {!signer && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Wallet signing not available. Please disconnect and reconnect your wallet on the Exchange page, then try again.</span>
            </div>
          )}

          {chainId !== null && chainId !== 42161 && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Your wallet is not on Arbitrum One. Clicking Deposit will prompt you to switch networks first.</span>
            </div>
          )}

          {address ? (
            <ExternalDepositHelp
              walletAddress={address}
              nativeUsdc={arbUsdcBalance}
              bridgedUsdc={arbBridgedUsdcBalance}
              minDepositUsdc={depositCfg?.minDepositUsdc ?? 5}
              isLoading={isLoadingArbBalance}
            />
          ) : null}

          <div className="space-y-4 py-2">
            {/* Arbitrum USDC balance */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Native USDC on Arbitrum</span>
              <span className="font-semibold font-mono">
                {isLoadingArbBalance ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                  </span>
                ) : arbUsdcBalance !== null ? (
                  `${arbUsdcBalance.toFixed(2)} USDC`
                ) : (
                  "—"
                )}
              </span>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="deposit-amount">Amount (USDC)</Label>
              <div className="flex gap-2">
                <Input
                  id="deposit-amount"
                  type="number"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-deposit-amount"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    const max = arbUsdcBalance ?? 0;
                    setDepositAmount((Math.floor(max * 100) / 100).toFixed(2));
                  }}
                  data-testid="button-deposit-max"
                >
                  Max
                </Button>
              </div>
              {arbUsdcBalance !== null && arbUsdcBalance <= 0 && (
                <p className="text-xs text-amber-500">No USDC found in your Arbitrum wallet. Please fund your wallet on Arbitrum first.</p>
              )}
              <p className="text-xs text-muted-foreground border border-border/80 rounded-md px-2 py-1.5 bg-muted/40">
                <strong className="text-foreground">First deposit?</strong> 1 USDC will be used for account initialization (HyperCore).
                Your send amount should also cover Circle forward fees so the balance after fees is not unexpectedly short.
              </p>
            </div>

            {/* Info note */}
            {depositCfg && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                <span>
                  Native USDC on Arbitrum One. Verified Bridge2 deposit contract reference (read-only) on{" "}
                  <a
                    href={`https://arbiscan.io/address/${depositCfg.verifiedHyperliquidBridge2Arbitrum}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                    data-testid="link-verified-hl-bridge2-arb"
                  >
                    Arbiscan
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  . Guide:{" "}
                  <a
                    href="https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    Circle CCTP → HyperCore
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  .
                </span>
              </div>
            )}

            {depositStep && (
              <div className="space-y-2 p-3 rounded-lg text-sm bg-primary/10 text-primary border border-primary/20">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>{depositStep}</span>
                </div>
                {depositAwaitingChain && (
                  <Progress value={85} className="h-1.5 bg-primary/20 [&>div]:animate-pulse" />
                )}
              </div>
            )}

            {depositResult && (
              <div className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm font-medium",
                depositResult.success
                  ? "bg-bullish/10 text-bullish border border-bullish/20"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              )}>
                {depositResult.success ? (
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span className="break-all">
                  {depositResult.success
                    ? `CCTP flow finished: mint on HyperEVM submitted. ${depositAmount} USDC gross from Arbitrum — net to HyperCore after forward fee and any HyperCore account fee.${depositResult.txHash ? ` Last tx: ${depositResult.txHash.slice(0, 10)}…` : ""}`
                    : depositResult.error || "Deposit failed"}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDepositOpen(false)} data-testid="button-deposit-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleDeposit}
              disabled={
                depositing ||
                !!depositCfgLoadError ||
                !depositAmount ||
                parseFloat(depositAmount) <= 0 ||
                (arbUsdcBalance !== null && parseFloat(depositAmount) > arbUsdcBalance + 0.001)
              }
              data-testid="button-deposit-confirm"
            >
              {depositing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Depositing...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4 mr-2" />
                  Deposit USDC
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Withdraw Dialog ── */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-withdraw">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-5 w-5 text-primary" />
              Withdraw USDC to Wallet
            </DialogTitle>
            <DialogDescription>
              Send USDC from your perp account to any Arbitrum wallet. Funds arrive on Arbitrum within minutes.
            </DialogDescription>
          </DialogHeader>

          {!signer && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Wallet signing not available. Please disconnect and reconnect your wallet on the Exchange page, then try again.</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            {/* Balance info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Withdrawable Balance</span>
              <span className="font-semibold font-mono">{formatPrice(withdrawablePerp)} USDC</span>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-amount">Amount (USDC)</Label>
              <div className="flex gap-2">
                <Input
                  id="withdraw-amount"
                  type="number"
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  data-testid="input-withdraw-amount"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setWithdrawAmount((Math.floor(withdrawablePerp * 100) / 100).toFixed(2))}
                  data-testid="button-withdraw-max"
                >
                  Max
                </Button>
              </div>
              {withdrawablePerp <= 0 && (
                <p className="text-xs text-amber-500">No withdrawable USDC. Open positions may be using your margin — close them first or wait for them to settle.</p>
              )}
            </div>

            {/* Destination address */}
            <div className="space-y-1.5">
              <Label htmlFor="withdraw-dest">Destination Wallet (Arbitrum)</Label>
              <Input
                id="withdraw-dest"
                type="text"
                placeholder="0x..."
                value={withdrawDest}
                onChange={(e) => setWithdrawDest(e.target.value)}
                className="font-mono text-xs"
                data-testid="input-withdraw-destination"
              />
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                <span>Defaults to your connected wallet. Make sure this is an Arbitrum address you control.</span>
              </div>
            </div>

            {withdrawStep && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-primary/10 text-primary border border-primary/20">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{withdrawStep}</span>
              </div>
            )}

            {withdrawResult && (
              <div className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm font-medium",
                withdrawResult.success
                  ? "bg-bullish/10 text-bullish border border-bullish/20"
                  : "bg-destructive/15 text-destructive border border-destructive/30"
              )}>
                {withdrawResult.success ? (
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span className="break-all">
                  {withdrawResult.success
                    ? `Withdrawal of ${withdrawAmount} USDC submitted! Funds will arrive at your wallet on Arbitrum within a few minutes.`
                    : withdrawResult.error || "Withdrawal failed"}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWithdrawOpen(false)} data-testid="button-withdraw-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={
                withdrawing ||
                !withdrawAmount ||
                parseFloat(withdrawAmount) <= 0 ||
                parseFloat(withdrawAmount) > withdrawablePerp ||
                !withdrawDest ||
                !/^0x[0-9a-fA-F]{40}$/.test(withdrawDest)
              }
              data-testid="button-withdraw-confirm"
            >
              {withdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Withdrawing...
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  Withdraw USDC
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
