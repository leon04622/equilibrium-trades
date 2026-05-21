import { useEffect, useRef } from "react";
import { LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  consumeTradingViewSignInReturn,
  persistTradingViewWorkspace,
  redirectToTradingViewSignIn,
} from "@/lib/tradingview-chart-url";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  onChartRefresh: () => void;
  className?: string;
};

/**
 * TradingView blocks login inside the chart iframe and inside our page (refused to connect).
 * Connect uses a same-tab redirect to tradingview.com sign-in, then returns to Equilibrium.
 */
export function TradingViewAccountBar({
  symbol,
  interval,
  onChartRefresh,
  className,
}: TradingViewAccountBarProps) {
  const { toast } = useToast();
  const handledReturnRef = useRef(false);

  useEffect(() => {
    if (handledReturnRef.current) return;
    if (!consumeTradingViewSignInReturn()) return;
    handledReturnRef.current = true;
    onChartRefresh();
    toast({
      title: "TradingView linked",
      description: "Your chart was refreshed with your TradingView session.",
    });
  }, [onChartRefresh, toast]);

  const connectAccount = () => {
    persistTradingViewWorkspace(symbol, interval);
    redirectToTradingViewSignIn();
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
        <strong className="text-foreground font-medium">Chart stays on Equilibrium.</strong> Optional: link
        your TradingView account — you sign in on TradingView in this tab, then we bring you back here
        automatically.
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
  );
}
