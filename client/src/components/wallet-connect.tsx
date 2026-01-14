import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet-context";
import { Wallet, LogOut, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ARBITRUM_CHAIN_ID = 42161;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const { 
    address, 
    chainId, 
    isConnecting, 
    isConnected, 
    connect, 
    disconnect,
    switchToArbitrum 
  } = useWallet();

  const isWrongNetwork = isConnected && chainId !== ARBITRUM_CHAIN_ID;

  if (!isConnected) {
    return (
      <Button
        onClick={connect}
        disabled={isConnecting}
        className="gap-2"
        data-testid="button-connect-wallet"
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  if (isWrongNetwork) {
    return (
      <Button
        onClick={switchToArbitrum}
        variant="destructive"
        className="gap-2"
        data-testid="button-switch-network"
      >
        <AlertTriangle className="h-4 w-4" />
        Switch to Arbitrum
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-wallet-menu">
          <Wallet className="h-4 w-4" />
          {shortenAddress(address!)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
          className="text-xs text-muted-foreground cursor-default"
          onSelect={(e) => e.preventDefault()}
        >
          Connected to Arbitrum
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(address!);
          }}
          data-testid="button-copy-address"
        >
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => window.open(`https://arbiscan.io/address/${address}`, "_blank")}
          data-testid="button-view-explorer"
        >
          View on Explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={disconnect}
          className="text-destructive"
          data-testid="button-disconnect-wallet"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
