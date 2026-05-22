import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  accounts: string[];
  walletName?: string | null;
  isSubmitting?: boolean;
  onSelect: (account: string) => void;
  onCancel: () => void;
};

function shorten(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletAccountPicker({
  accounts,
  walletName,
  isSubmitting,
  onSelect,
  onCancel,
}: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Choose an account</p>
        <p className="text-xs text-muted-foreground mt-1">
          {walletName ? `${walletName} returned ` : ""}
          {accounts.length} addresses. Pick the wallet you want to trade with on Hyperliquid.
        </p>
      </div>
      <div className="space-y-2 max-h-[40vh] overflow-y-auto">
        {accounts.map((acc) => (
          <Button
            key={acc}
            type="button"
            variant="outline"
            className="w-full justify-between h-12 font-mono text-sm"
            disabled={isSubmitting}
            onClick={() => onSelect(acc)}
            data-testid={`button-pick-account-${acc.slice(2, 8)}`}
          >
            <span>{shorten(acc)}</span>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="w-full text-muted-foreground"
        disabled={isSubmitting}
        onClick={onCancel}
      >
        Back to wallet list
      </Button>
    </div>
  );
}
