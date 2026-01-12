import { useState } from "react";
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
import { HyperliquidStatus } from "@/components/hyperliquid-status";
import { useToast } from "@/hooks/use-toast";

export default function Hyperliquid() {
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      toast({
        title: "Missing credentials",
        description: "Please enter both API Key and API Secret",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 1500));
    setConnected(true);
    setIsConnecting(false);
    toast({
      title: "Connected!",
      description: "Your Hyperliquid account is now connected",
    });
  };

  const handleDisconnect = () => {
    setConnected(false);
    setApiKey("");
    setApiSecret("");
    toast({
      title: "Disconnected",
      description: "Your Hyperliquid account has been disconnected",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Hyperliquid</h1>
          <Badge 
            variant={connected ? "default" : "secondary"}
            className={connected ? "bg-success text-success-foreground ml-2" : "ml-2"}
          >
            {connected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Connect your Hyperliquid account to trade directly from Equilibrium
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {!connected ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-display">Connect Your Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Secure Connection</AlertTitle>
                  <AlertDescription>
                    Your API keys are encrypted and never stored on our servers. 
                    We recommend creating an API-only wallet with limited permissions.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="Enter your Hyperliquid API Key"
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
                      placeholder="Enter your Hyperliquid API Secret"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      data-testid="input-api-secret"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    onClick={handleConnect} 
                    disabled={isConnecting}
                    className="flex-1"
                    data-testid="button-connect"
                  >
                    {isConnecting ? (
                      <>Connecting...</>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4 mr-2" />
                        Connect Account
                      </>
                    )}
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
                    <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">0x1234...abcd</code>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                    <p className="text-xl font-mono font-bold">$10,532.45</p>
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
              <CardTitle className="font-display">Getting Started with Hyperliquid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold shrink-0">
                  1
                </div>
                <div>
                  <h4 className="font-medium">Create a Hyperliquid Account</h4>
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
            address={connected ? "0x1234567890abcdef1234567890abcdef12345678" : ""}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Why Hyperliquid?</CardTitle>
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
              New to trading? Practice with paper trading first on the Hyperliquid testnet 
              before using real funds.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
