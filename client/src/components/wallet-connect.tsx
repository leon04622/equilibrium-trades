import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet-context";
import { Wallet, LogOut, AlertTriangle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletConnectSheet } from "./wallet-connect-sheet";

const ARBITRUM_CHAIN_ID = 42161;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const { 
    address, 
    chainId, 
    isConnected, 
    disconnect,
    switchToArbitrum 
  } = useWallet();

  const isWrongNetwork = isConnected && chainId !== ARBITRUM_CHAIN_ID;

  if (!isConnected) {
    return <WalletConnectSheet />;
  }

  if (isWrongNetwork) {
    return (
      <Button
        onClick={switchToArbitrum}
        variant="destructive"
        className="gap-2"
        data-testid="button-switch-network"
        aria-label="Switch wallet network to Arbitrum"
      >
        <AlertTriangle className="h-4 w-4" />
        Switch to Arbitrum
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 rounded-xl border-primary/20 bg-background/80 shadow-sm backdrop-blur"
          data-testid="button-wallet-menu"
          aria-label={`Wallet menu for ${shortenAddress(address!)}`}
        >
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.45)]" />
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">{shortenAddress(address!)}</span>
          <span className="sm:hidden">{address!.slice(0, 4)}...</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
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
