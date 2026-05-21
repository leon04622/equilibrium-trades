import { ExternalLink, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildTradingViewFullChartUrl,
  buildTradingViewSignInUrl,
  persistTradingViewWorkspace,
} from "@/lib/tradingview-chart-url";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  className?: string;
};

/**
 * The free TradingView embed cannot attach to a TV account. Full login, saved layouts,
 * and drawings live on tradingview.com — open that chart in a tab (cookies remember you).
 */
export function TradingViewAccountBar({ symbol, interval, className }: TradingViewAccountBarProps) {
  const fullChartUrl = buildTradingViewFullChartUrl(symbol, interval);
  const signInUrl = buildTradingViewSignInUrl(fullChartUrl);

  const openFullChart = () => {
    persistTradingViewWorkspace(symbol, interval);
    window.open(fullChartUrl, "_blank", "noopener,noreferrer");
  };

  const openSignIn = () => {
    persistTradingViewWorkspace(symbol, interval);
    window.open(signInUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-2 py-1.5 md:px-3"
      }
      data-testid="tradingview-account-bar"
    >
      <p className="text-[10px] md:text-xs text-muted-foreground leading-snug max-w-xl">
        <strong className="text-foreground font-medium">TradingView account:</strong> log in on TradingView to save
        layouts and drawings. Your session is remembered in the browser. Use{" "}
        <strong className="text-foreground">Open full chart</strong> for the full workspace (recommended).
      </p>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px] md:text-xs"
          onClick={openSignIn}
          data-testid="button-tradingview-sign-in"
        >
          <LogIn className="h-3 w-3 mr-1" />
          Log in
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[10px] md:text-xs"
          onClick={openFullChart}
          data-testid="button-tradingview-open-full"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Open full chart
        </Button>
      </div>
    </div>
  );
}
