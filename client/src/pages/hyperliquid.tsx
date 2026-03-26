import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  TrendingUp, Link2, ExternalLink, Shield, Zap, 
  Wallet, AlertCircle, CheckCircle2, Copy, Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HyperliquidStatus } from "@/components/hyperliquid-status";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/lib/trading-context";
import { useWallet } from "@/lib/wallet-context";

const HYPERLIQUID_STORAGE_KEY = "equilibrium_hyperliquid_connection";

interface HyperliquidConnection {
  method: "wallet" | "api";
  address: string;
  apiKey?: string;
  connectedAt: string;
}

export default function Hyperliquid() {
  const navigate = useNavigate();
  const [connectionMethod, setConnectionMethod] = useState<"wallet" | "api">("wallet");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [savedConnection, setSavedConnection] = useState<HyperliquidConnection | null>(null);
  const [initialized, setInitialized] = useState(false);
  const { toast } = useToast();
  const { connect: connectTrading, disconnect: disconnectTrading, connected: tradingConnected } = useTrading();
  const { builderCodeApproved, address: walletAddress, refreshApprovalStatus } = useWallet();

  // Load saved connection on mount and sync with TradingContext
  useEffect(() => {
    if (initialized) return;
    try {
      const stored = localStorage.getItem(HYPERLIQUID_STORAGE_KEY);
      if (stored) {
        const connection = JSON.parse(stored) as HyperliquidConnection;
        setSavedConnection(connection);
        // Sync TradingContext with saved connection
        if (connection.address) {
          connectTrading(connection.address);
        }
      }
      setInitialized(true);
    } catch {
      setInitialized(true);
    }
  }, [initialized, connectTrading]);

  const connected = !!savedConnection;

  const handleWalletConnect = async () => {
    setIsConnecting(true);
    
    // Check if MetaMask or similar wallet is available
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ 
          method: "eth_requestAccounts" 
        });
        if (accounts && accounts[0]) {
          const address = accounts[0];
          const connection: HyperliquidConnection = {
            method: "wallet",
            address,
            connectedAt: new Date().toISOString(),
          };
          localStorage.setItem(HYPERLIQUID_STORAGE_KEY, JSON.stringify(connection));
          setSavedConnection(connection);
          connectTrading(address);
          toast({
            title: "Wallet Connected!",
            description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
          });
        }
      } catch (err: any) {
        toast({
          title: "Connection Failed",
          description: err.message || "Failed to connect wallet",
          variant: "destructive",
        });
      }
    } else {
      // No wallet detected - prompt user to install MetaMask
      toast({
        title: "No Wallet Detected",
        description: "Please install MetaMask or another Web3 wallet to connect.",
        variant: "destructive",
      });
    }
    
    setIsConnecting(false);
  };

  const handleApiConnect = async () => {
    if (!apiKey || !apiSecret) {
      toast({
        title: "Missing credentials",
        description: "Please enter both API Key and API Secret",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    
    // Store API credentials - actual trading uses wallet signing
    const connection: HyperliquidConnection = {
      method: "api",
      address: `api-${apiKey.slice(0, 8)}...`,
      apiKey: apiKey.slice(0, 8) + "...",
      connectedAt: new Date().toISOString(),
    };
    localStorage.setItem(HYPERLIQUID_STORAGE_KEY, JSON.stringify(connection));
    setSavedConnection(connection);
    connectTrading(connection.address);
    
    setIsConnecting(false);
    toast({
      title: "API Credentials Saved",
      description: "Note: For trading, please use Wallet Connection instead. API keys are for read-only access.",
    });
  };

  const handleDisconnect = () => {
    localStorage.removeItem(HYPERLIQUID_STORAGE_KEY);
    setSavedConnection(null);
    setApiKey("");
    setApiSecret("");
    // Also disconnect from TradingContext
    disconnectTrading();
    toast({
      title: "Disconnected",
      description: "Your trading account has been disconnected",
    });
  };

  const copyAddress = () => {
    if (savedConnection?.address) {
      navigator.clipboard.writeText(savedConnection.address);
      toast({ title: "Address copied!" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Trading Account</h1>
          <Badge 
            variant={connected ? "default" : "secondary"}
            className={connected ? "bg-success text-success-foreground ml-2" : "ml-2"}
          >
            {connected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Connect your exchange account to trade directly from the Equilibrium platform
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {!builderCodeApproved && (
            <OnboardingFlow 
              onComplete={() => {
                refreshApprovalStatus();
                navigate("/trading");
              }} 
            />
          )}
          
          {!connected ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Connect Trading Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Secure Connection</AlertTitle>
                  <AlertDescription>
                    Connect your wallet directly or use API keys for automated trading.
                    Your credentials are stored locally and never sent to our servers.
                  </AlertDescription>
                </Alert>

                <Tabs value={connectionMethod} onValueChange={(v) => setConnectionMethod(v as "wallet" | "api")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="wallet" data-testid="tab-wallet">
                      <Wallet className="h-4 w-4 mr-2" />
                      Wallet
                    </TabsTrigger>
                    <TabsTrigger value="api" data-testid="tab-api">
                      <Link2 className="h-4 w-4 mr-2" />
                      API Keys
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="wallet" className="space-y-4 mt-4">
                    <div className="text-center py-6">
                      <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Connect Your Wallet</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Connect MetaMask or any Web3 wallet to access live trading
                      </p>
                      <Button 
                        onClick={handleWalletConnect}
                        disabled={isConnecting}
                        size="lg"
                        data-testid="button-connect-wallet"
                      >
                        {isConnecting ? "Connecting..." : "Connect Wallet"}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="api" className="space-y-4 mt-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <Input
                          id="apiKey"
                          type="password"
                          placeholder="Enter your API Key"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          data-testid="input-api-key"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apiSecret">API Secret</Label>
                        <Input
                          id="apiSecret"
                          type="password"
                          placeholder="Enter your API Secret"
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          data-testid="input-api-secret"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button 
                        onClick={handleApiConnect} 
                        disabled={isConnecting}
                        className="flex-1"
                        data-testid="button-connect-api"
                      >
                        {isConnecting ? "Connecting..." : "Connect API"}
                      </Button>
                      <Button variant="outline" asChild>
                        <a 
                          href="https://app.hyperliquid.xyz/API" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          data-testid="link-get-api-keys"
                        >
                          Get API Keys
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-display">Account Connected</CardTitle>
                  <Badge className="bg-success text-success-foreground">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      {savedConnection?.method === "wallet" ? "Wallet Address" : "API Connection"}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">
                        {savedConnection?.address 
                          ? `${savedConnection.address.slice(0, 10)}...${savedConnection.address.slice(-6)}`
                          : "Unknown"
                        }
                      </code>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyAddress}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Connection Type</p>
                    <p className="text-xl font-mono font-bold capitalize">{savedConnection?.method || "Unknown"}</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-bullish/10 border border-bullish/20 p-4 text-center">
                    <p className="text-2xl font-bold text-bullish">5</p>
                    <p className="text-xs text-muted-foreground">Open Positions</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 text-center">
                    <p className="text-2xl font-bold text-primary">12</p>
                    <p className="text-xs text-muted-foreground">Pending Orders</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold">$1,245</p>
                    <p className="text-xs text-muted-foreground">Today's P&L</p>
                  </div>
                </div>

                <Button 
                  variant="destructive" 
                  onClick={handleDisconnect}
                  data-testid="button-disconnect-main"
                >
                  Disconnect Account
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Create Your Trading Account</h4>
                  <p className="text-sm text-muted-foreground">
                    Visit{" "}
                    <a 
                      href="https://app.hyperliquid.xyz" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      app.hyperliquid.xyz
                    </a>{" "}
                    and connect your wallet to create an account.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                  2
                </div>
                <div>
                  <h4 className="font-medium">Deposit USDC</h4>
                  <p className="text-sm text-muted-foreground">
                    Fund your account with USDC on Arbitrum to start trading perpetuals.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                  3
                </div>
                <div>
                  <h4 className="font-medium">Generate API Keys</h4>
                  <p className="text-sm text-muted-foreground">
                    Go to{" "}
                    <a 
                      href="https://app.hyperliquid.xyz/API" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      API settings
                    </a>{" "}
                    and create an API wallet with trading permissions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                  4
                </div>
                <div>
                  <h4 className="font-medium">Connect to Equilibrium</h4>
                  <p className="text-sm text-muted-foreground">
                    Enter your API credentials above to start trading with AI-powered signals.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <HyperliquidStatus
            connected={connected}
            balance={connected ? 10532.45 : 0}
            address={savedConnection?.address || ""}
            onConnect={handleWalletConnect}
            onDisconnect={handleDisconnect}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Why This Exchange?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Lightning Fast</p>
                  <p className="text-xs text-muted-foreground">
                    Built on its own L1 for maximum speed
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Fully On-chain</p>
                  <p className="text-xs text-muted-foreground">
                    Your funds are always in your control
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Wallet className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Low Fees</p>
                  <p className="text-xs text-muted-foreground">
                    Competitive maker/taker fees
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Paper Trading</AlertTitle>
            <AlertDescription className="text-xs">
              New to trading? Practice with paper trading first on the the paper trading testnet 
              before using real funds.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
