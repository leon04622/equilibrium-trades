import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  liquidationPrice: number;
}

interface SpotBalance {
  asset: string;
  free: number;
  locked: number;
  usdValue: number;
}

const mockPositions: Position[] = [
  {
    id: "1",
    symbol: "BTC",
    side: "long",
    size: 0.15,
    entryPrice: 102450,
    markPrice: 104280,
    leverage: 10,
    margin: 1537.5,
    unrealizedPnl: 274.50,
    unrealizedPnlPercent: 17.86,
    liquidationPrice: 92205,
  },
  {
    id: "2",
    symbol: "ETH",
    side: "short",
    size: 2.5,
    entryPrice: 3850,
    markPrice: 3920,
    leverage: 5,
    margin: 1925,
    unrealizedPnl: -175,
    unrealizedPnlPercent: -9.09,
    liquidationPrice: 4620,
  },
  {
    id: "3",
    symbol: "SOL",
    side: "long",
    size: 50,
    entryPrice: 210,
    markPrice: 218.50,
    leverage: 20,
    margin: 525,
    unrealizedPnl: 425,
    unrealizedPnlPercent: 80.95,
    liquidationPrice: 199.50,
  },
];

const mockSpotBalances: SpotBalance[] = [
  { asset: "USDC", free: 15420.50, locked: 0, usdValue: 15420.50 },
  { asset: "BTC", free: 0.0245, locked: 0, usdValue: 2554.86 },
  { asset: "ETH", free: 1.25, locked: 0.5, usdValue: 6860 },
  { asset: "SOL", free: 25.5, locked: 0, usdValue: 5571.75 },
];

export default function Portfolio() {
  const totalEquity = 28450.75;
  const availableBalance = 15420.50;
  const totalUnrealizedPnl = mockPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalMarginUsed = mockPositions.reduce((sum, p) => sum + p.margin, 0);

  const formatPrice = (val: number) => {
    if (val >= 1000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(2);
    return val.toFixed(6);
  };

  const formatPnl = (val: number) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
          <p className="text-muted-foreground">Manage your holdings and positions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-refresh-portfolio">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" data-testid="button-deposit">
            <DollarSign className="h-4 w-4 mr-2" />
            Deposit
          </Button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-equity">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equity</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatPrice(totalEquity)}</div>
            <p className="text-xs text-muted-foreground">Account value + unrealized PnL</p>
          </CardContent>
        </Card>

        <Card data-testid="card-available-balance">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
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
                {((totalUnrealizedPnl / totalEquity) * 100).toFixed(2)}% of equity
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
              {((totalMarginUsed / totalEquity) * 100).toFixed(1)}% of equity
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Positions and Spot */}
      <Tabs defaultValue="perp" className="space-y-4">
        <TabsList data-testid="tabs-portfolio">
          <TabsTrigger value="perp" data-testid="tab-perpetuals">
            Perpetuals ({mockPositions.length})
          </TabsTrigger>
          <TabsTrigger value="spot" data-testid="tab-spot">
            Spot ({mockSpotBalances.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Open Positions</CardTitle>
              <CardDescription>Your active perpetual futures positions</CardDescription>
            </CardHeader>
            <CardContent>
              {mockPositions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No open positions</p>
                  <p className="text-sm">Start trading to see your positions here</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {mockPositions.map((position) => (
                      <div
                        key={position.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                        data-testid={`position-${position.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{position.symbol}-PERP</span>
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
                              ({position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Mark: ${formatPrice(position.markPrice)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Liq: ${formatPrice(position.liquidationPrice)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" data-testid={`button-close-${position.id}`}>
                            Close
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-edit-${position.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spot" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spot Balances</CardTitle>
              <CardDescription>Your crypto asset holdings</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {mockSpotBalances.map((balance) => (
                    <div
                      key={balance.asset}
                      className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                      data-testid={`balance-${balance.asset}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm">
                          {balance.asset.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold">{balance.asset}</div>
                          <div className="text-sm text-muted-foreground">
                            Free: {formatPrice(balance.free)}
                            {balance.locked > 0 && (
                              <span className="ml-2">| Locked: {formatPrice(balance.locked)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-semibold">${formatPrice(balance.usdValue)}</div>
                        <div className="text-sm text-muted-foreground">USD Value</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" data-testid={`button-trade-${balance.asset}`}>
                          Trade
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-withdraw-${balance.asset}`}>
                          Withdraw
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Connection Status */}
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">
              Connect your wallet to see real balances and positions
            </span>
          </div>
          <Button variant="outline" size="sm" data-testid="button-connect-wallet">
            Connect Wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
