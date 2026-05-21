import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  buildTradingViewSignInReturnUrl,
  buildTradingViewSignInUrl,
  markTradingViewSignInStarted,
} from "@/lib/tradingview-chart-url";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshChart: () => void;
};

/**
 * TradingView blocks iframe login and often opens chart in a new window after OAuth.
 * We never use window.open — only an optional same-tab link the user taps explicitly.
 */
export function TradingViewConnectHelp({ open, onOpenChange, onRefreshChart }: Props) {
  const signInHref = buildTradingViewSignInUrl(buildTradingViewSignInReturnUrl());

  const handleRefreshOnly = () => {
    onRefreshChart();
    onOpenChange(false);
  };

  const handleSameTabSignIn = () => {
    markTradingViewSignInStarted();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>TradingView account</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            The chart on Equilibrium is TradingView&apos;s free embed. It cannot log you in inside the page —
            and Google/social sign-in often opens a separate TradingView window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Easiest:</strong> use the chart without linking an account.
            Tap <strong className="text-foreground">Refresh chart</strong> anytime.
          </p>
          <p>
            <strong className="text-foreground">To link an account:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1.5 pl-0.5">
            <li>Tap &quot;Sign in on TradingView (this tab)&quot; below — not the chart logo inside the graph.</li>
            <li>Sign in with email/password if possible (avoids extra pop-up windows).</li>
            <li>When done, return to Equilibrium and tap Refresh chart.</li>
          </ol>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" className="w-full" onClick={handleRefreshOnly}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh chart
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <a
              href={signInHref}
              target="_self"
              rel="noopener noreferrer"
              onClick={handleSameTabSignIn}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Sign in on TradingView (this tab)
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
