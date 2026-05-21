import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildTradingViewSignInReturnUrl, buildTradingViewSignInUrl } from "@/lib/tradingview-chart-url";
import { ExternalLink } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

/**
 * In-page sign-in (not a separate browser window). TradingView does not allow
 * logging in inside the free chart embed iframe — cookies are set on tradingview.com here.
 */
export function TradingViewSignInDialog({ open, onOpenChange, onComplete }: Props) {
  const [useFallbackTab, setUseFallbackTab] = useState(false);
  const signInUrl = buildTradingViewSignInUrl(buildTradingViewSignInReturnUrl());

  const finish = useCallback(() => {
    onOpenChange(false);
    onComplete();
    setUseFallbackTab(false);
  }, [onComplete, onOpenChange]);

  const openInTab = useCallback(() => {
    window.open(signInUrl, "_blank", "noopener,noreferrer");
    setUseFallbackTab(true);
  }, [signInUrl]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          onComplete();
          setUseFallbackTab(false);
        }
      }}
    >
      <DialogContent className="flex max-h-[min(88vh,720px)] w-[min(100vw-1.5rem,28rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="space-y-1 border-b border-border/80 px-4 py-3 text-left">
          <DialogTitle className="text-base">Sign in to TradingView</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Your chart stays on Equilibrium. Sign in below so saved layouts and watchlists can sync to the
            embedded chart — TradingView does not allow login inside the chart frame itself.
          </DialogDescription>
        </DialogHeader>

        {!useFallbackTab ? (
          <iframe
            title="TradingView sign in"
            src={signInUrl}
            className="min-h-[420px] w-full flex-1 border-0 bg-background"
          />
        ) : (
          <div className="space-y-3 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign-in opened in a new tab. When you are done, return here and tap{" "}
              <strong className="text-foreground">Done</strong> to refresh the chart.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={openInTab}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open sign-in again
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-4 py-3">
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => (useFallbackTab ? setUseFallbackTab(false) : openInTab())}
          >
            {useFallbackTab ? "Try in-page sign-in" : "Sign-in not loading? Open in tab"}
          </button>
          <Button type="button" size="sm" onClick={finish}>
            Done — refresh chart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
