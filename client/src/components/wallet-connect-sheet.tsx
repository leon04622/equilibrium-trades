import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useWallet, WalletType } from "@/lib/wallet-context";
import { Wallet, ExternalLink, Smartphone, Loader2, CheckCircle2, Globe, Hexagon } from "lucide-react";
import { useState } from "react";

interface WalletConnectSheetProps {
  trigger?: React.ReactNode;
  onConnect?: () => void;
}

export function WalletConnectSheet({ trigger, onConnect }: WalletConnectSheetProps) {
  const { 
    detectedWallets, 
    isMobile, 
    connect, 
    isConnecting, 
    isConnected, 
    address,
    openInWalletBrowser 
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<WalletType | null>(null);

  const handleConnect = async (walletType: WalletType) => {
    setConnectingWallet(walletType);
    try {
      await connect(walletType);
      onConnect?.();
      setOpen(false);
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleOpenInWallet = (walletType: WalletType) => {
    openInWalletBrowser(walletType);
  };

  // If connected, show address
  if (isConnected && address) {
    return (
      <Button variant="outline" className="gap-2" data-testid="button-wallet-connected">
        <CheckCircle2 className="h-4 w-4 text-bullish" />
        {address.slice(0, 6)}...{address.slice(-4)}
      </Button>
    );
  }

  const defaultTrigger = (
    <Button className="gap-2" data-testid="button-connect-wallet">
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || defaultTrigger}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Connect Wallet</SheetTitle>
          <SheetDescription>
            Choose a wallet to connect to Equilibrium
          </SheetDescription>
        </SheetHeader>
        
        <div className="py-6 space-y-3">
          {/* Show detected wallets on desktop */}
          {!isMobile && detectedWallets.length > 0 ? (
            <>
              {detectedWallets.map((wallet) => (
                <Button
                  key={wallet.type}
                  variant="outline"
                  className="w-full justify-between h-14 text-left"
                  onClick={() => handleConnect(wallet.type)}
                  disabled={isConnecting}
                  data-testid={`button-connect-${wallet.type}`}
                >
                  <div className="flex items-center gap-3">
                    {wallet.type === "metamask" && (
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                        <Hexagon className="h-5 w-5 text-orange-500" />
                      </div>
                    )}
                    {wallet.type === "rabby" && (
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-blue-500" />
                      </div>
                    )}
                    {wallet.type === "injected" && (
                      <div className="w-8 h-8 rounded-full bg-gray-500/20 flex items-center justify-center">
                        <Wallet className="h-4 w-4 text-gray-500" />
                      </div>
                    )}
                    <span className="font-medium">{wallet.name}</span>
                  </div>
                  {connectingWallet === wallet.type ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              ))}
            </>
          ) : !isMobile && detectedWallets.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                No wallet detected. Install a browser wallet to continue.
              </p>
              <Button
                variant="outline"
                className="w-full justify-between h-14"
                onClick={() => window.open("https://metamask.io/download/", "_blank")}
                data-testid="button-install-metamask"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Hexagon className="h-5 w-5 text-orange-500" />
                  </div>
                  <span className="font-medium">Install MetaMask</span>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="outline"
                className="w-full justify-between h-14"
                onClick={() => window.open("https://rabby.io/", "_blank")}
                data-testid="button-install-rabby"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-blue-500" />
                  </div>
                  <span className="font-medium">Install Rabby Wallet</span>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
            </>
          ) : (
            /* Mobile options */
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Tap below to open Equilibrium in your wallet's browser and connect.
              </p>
              <Button
                variant="outline"
                className="w-full justify-between h-14"
                onClick={() => handleOpenInWallet("metamask")}
                data-testid="button-open-metamask"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Hexagon className="h-5 w-5 text-orange-500" />
                  </div>
                  <div className="text-left">
                    <span className="font-medium block">MetaMask</span>
                    <span className="text-xs text-muted-foreground">Recommended for mobile</span>
                  </div>
                </div>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="outline"
                className="w-full justify-between h-14"
                onClick={() => window.open("https://rabby.io/", "_blank")}
                data-testid="button-rabby-mobile"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <span className="font-medium block">Rabby Wallet</span>
                    <span className="text-xs text-muted-foreground">Desktop browser only</span>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>
              <div className="text-xs text-muted-foreground text-center pt-2 space-y-1">
                <p>After tapping MetaMask, the app will open in MetaMask's browser.</p>
                <p className="text-primary">You'll trade directly from MetaMask's browser.</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
