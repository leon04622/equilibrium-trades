import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ExternalLink,
  AlertCircle,
  Coins,
  ArrowRightLeft,
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";
import { getSpotBalances, transferUsdcBetweenAccounts, type SpotBalance } from "@/lib/hyperliquid-client";
import { Link, useLocation } from "wouter";

export default function Portfolio() {
  const { 
    connected, 
    positions, 
    accountValue,
    marginUsed,
    balance,
    currentPrices,
    refreshAccount,
  } = useTrading();
  const { address, signer } = useWallet();
  const [, setLocation] = useLocation();
  const [spotBalances, setSpotBalances] = useState<SpotBalance[]>([]);
  const [isLoadingSpot, setIsLoadingSpot] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToPerp, setTransferToPerp] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<{ success: boolean; error?: string } | null>(null);

  const totalEquity = accountValue || 0;
  const availableBalance = balance || 0;
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
    }
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

  const maxTransferAmount = transferToPerp ? usdcSpotAvailable : availableBalance;

  const openTransferDialog = (toPerp: boolean) => {
    const max = toPerp ? usdcSpotAvailable : (balance || 0);
    setTransferToPerp(toPerp);
    // Pre-fill with max available so the button is immediately usable
    setTransferAmount(max > 0 ? max.toFixed(2) : "");
    setTransferResult(null);
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!signer) {
      setTransferResult({ success: false, error: "Wallet not connected. Please reconnect your wallet and try again." });
      return;
    }
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setTransferResult({ success: false, error: "Please enter a valid amount greater than 0." });
      return;
    }
    if (amount > maxTransferAmount) {
      setTransferResult({ success: false, error: `Amount exceeds available balance of ${maxTransferAmount.toFixed(2)} USDC.` });
      return;
    }
    setTransferring(true);
    setTransferResult(null);
    console.log(`Initiating USDC transfer: ${amount} USDC, toPerp=${transferToPerp}`);
    try {
      const result = await transferUsdcBetweenAccounts(signer, amount, transferToPerp);
      setTransferResult(result);
      if (result.success) {
        setTimeout(() => {
          setTransferOpen(false);
          handleRefresh();
        }, 2000);
      }
    } catch (err: any) {
      console.error("Transfer caught error:", err);
      setTransferResult({ success: false, error: err.message || "Transfer failed" });
    } finally {
      setTransferring(false);
    }
  };

  if (!connected) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
            <p className="text-muted-foreground">Manage your holdings and positions</p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Wallet Not Connected</h3>
            <p className="text-muted-foreground mb-4">
              Connect your wallet to view your Hyperliquid portfolio, positions, and balances.
            </p>
            <Link href="/hyperliquid">
              <Button data-testid="button-connect-wallet">
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground">Your Hyperliquid holdings and positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-portfolio">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openTransferDialog(true)}
            data-testid="button-transfer-funds"
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transfer Funds
          </Button>
          <a href="https://app.hyperliquid.xyz/trade" target="_blank" rel="noopener noreferrer">
            <Button size="sm" data-testid="button-deposit">
              <DollarSign className="h-4 w-4 mr-2" />
              Deposit on HL
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-equity">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(totalEquity)}</div>
            <p className="text-xs text-muted-foreground">Account value</p>
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
              <CardDescription>Your active perpetual futures positions on Hyperliquid</CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No open positions</p>
                  <p className="text-sm">Start trading to see your positions here</p>
                  <Link href="/trading">
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
                            <Link href={`/trading?coin=${position.coin}`}>
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
              <CardDescription>Your spot token balances on Hyperliquid</CardDescription>
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
                  <p className="text-sm">Deposit tokens to see your spot balances here</p>
                  <a href="https://app.hyperliquid.xyz/trade" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="mt-4" data-testid="button-deposit-spot">
                      Deposit on Hyperliquid
                    </Button>
                  </a>
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
                              <Link href={`/trading?coin=${balance.coin}`}>
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
              Connected to Hyperliquid Mainnet
            </span>
          </div>
          <a href="https://app.hyperliquid.xyz/portfolio" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" data-testid="button-view-on-hl">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Hyperliquid
            </Button>
          </a>
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
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex-1 text-center">
                <p className="font-medium">{transferToPerp ? "Spot Account" : "Perp Account"}</p>
                <p className="text-xs text-muted-foreground">
                  {transferToPerp
                    ? `${formatPrice(usdcSpotAvailable)} USDC available`
                    : `${formatPrice(availableBalance)} USDC available`}
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
                  setTransferAmount(usdcSpotAvailable > 0 ? usdcSpotAvailable.toFixed(2) : "");
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
                  setTransferAmount(availableBalance > 0 ? availableBalance.toFixed(2) : "");
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
                  onClick={() => setTransferAmount(maxTransferAmount.toFixed(2))}
                  data-testid="button-transfer-max"
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {formatPrice(maxTransferAmount)} USDC
              </p>
            </div>

            {transferResult && (
              <div className={cn(
                "flex items-center gap-2 p-3 rounded-lg text-sm",
                transferResult.success
                  ? "bg-bullish/10 text-bullish border border-bullish/20"
                  : "bg-bearish/10 text-bearish border border-bearish/20"
              )}>
                {transferResult.success ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span>
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
    </div>
  );
}
