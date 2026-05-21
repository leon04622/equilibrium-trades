import { useState } from "react";
import { LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { persistTradingViewWorkspace } from "@/lib/tradingview-chart-url";
import { TradingViewSignInDialog } from "@/components/tradingview-sign-in-dialog";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  onChartRefresh: () => void;
  className?: string;
};

/**
 * Free TradingView embed cannot run tradingview.com login inside the chart iframe.
 * Sign-in uses an in-page panel on tradingview.com; cookies then apply to the widget below.
 */
export function TradingViewAccountBar({
  symbol,
  interval,
  onChartRefresh,
  className,
}: TradingViewAccountBarProps) {
  const [signInOpen, setSignInOpen] = useState(false);

  const connectAccount = () => {
    persistTradingViewWorkspace(symbol, interval);
    setSignInOpen(true);
  };

  return (
    <>
      <div
        className={
          className ??
          "flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-2 py-1.5 md:px-3"
        }
        data-testid="tradingview-account-bar"
      >
        <p className="text-[10px] md:text-xs text-muted-foreground leading-snug max-w-xl">
          <strong className="text-foreground font-medium">Chart stays on Equilibrium.</strong> Optional: link
          your TradingView account to sync saved layouts — sign in in the panel (not a separate chart window).
        </p>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px] md:text-xs"
            onClick={connectAccount}
            data-testid="button-tradingview-sign-in"
          >
            <LogIn className="h-3 w-3 mr-1" />
            Connect TradingView
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] md:text-xs"
            onClick={onChartRefresh}
            data-testid="button-tradingview-refresh-chart"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh chart
          </Button>
        </div>
      </div>

      <TradingViewSignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onComplete={onChartRefresh}
      />
    </>
  );
}
