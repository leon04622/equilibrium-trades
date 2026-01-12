import { useState } from "react";
import { 
  Link2, Link2Off, Wallet, ChevronDown, ExternalLink, 
  RefreshCcw, AlertCircle, CheckCircle2 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface HyperliquidStatusProps {
  connected?: boolean;
  balance?: number;
  address?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function HyperliquidStatus({ 
  connected = false, 
  balance = 0, 
  address = "",
  onConnect,
  onDisconnect
}: HyperliquidStatusProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formatAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Card data-testid="hyperliquid-status">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Hyperliquid
          </CardTitle>
          <Badge 
            variant={connected ? "default" : "secondary"}
            className={cn(
              "gap-1",
              connected && "bg-success text-success-foreground hover:bg-success/90"
            )}
          >
            {connected ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Not Connected
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <>
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono">{formatAddress(address)}</code>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  data-testid="button-copy-address"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
              <p className="text-xl font-mono font-bold">
                ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                <span className="text-sm font-normal text-muted-foreground ml-1">USDC</span>
              </p>
            </div>

            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="text-xs">Account Actions</span>
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    isOpen && "rotate-180"
                  )} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full justify-start gap-2"
                  data-testid="button-refresh-balance"
                >
                  <RefreshCcw className="h-3 w-3" />
                  Refresh Balance
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="w-full justify-start gap-2"
                  onClick={onDisconnect}
                  data-testid="button-disconnect"
                >
                  <Link2Off className="h-3 w-3" />
                  Disconnect Wallet
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your Hyperliquid account to start trading with AI-powered pattern detection.
            </p>
            <Button 
              className="w-full gap-2" 
              onClick={onConnect}
              data-testid="button-connect-hyperliquid"
            >
              <Link2 className="h-4 w-4" />
              Connect to Hyperliquid
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">
              Your API keys are encrypted and never stored on our servers
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
