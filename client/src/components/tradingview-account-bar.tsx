import { useEffect, useRef, useState } from "react";
import { HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TradingViewConnectHelp } from "@/components/tradingview-connect-help";
import {
  consumeTradingViewSignInReturn,
  consumeTradingViewSignInStartedReminder,
  persistTradingViewWorkspace,
} from "@/lib/tradingview-chart-url";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  onChartRefresh: () => void;
  className?: string;
};

/**
 * Free TV embed cannot log in inside the chart. We never window.open TradingView —
 * optional same-tab sign-in is only via an explicit link in the help dialog.
 */
export function TradingViewAccountBar({
  symbol,
  interval,
  onChartRefresh,
  className,
}: TradingViewAccountBarProps) {
  const { toast } = useToast();
  const handledReturnRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  useEffect(() => {
    if (!consumeTradingViewSignInStartedReminder()) return;
    toast({
      title: "Back on Equilibrium?",
      description:
        "If TradingView opened in another window, close it and tap Refresh chart. Do not use the logo inside the chart to sign in.",
      duration: 12_000,
    });
  }, [toast]);

  const openHelp = () => {
    persistTradingViewWorkspace(symbol, interval);
    setHelpOpen(true);
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
          <strong className="text-foreground font-medium">Chart stays on Equilibrium.</strong> No account
          required. Optional TV login uses the help button — not a pop-up from the chart itself.
        </p>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px] md:text-xs"
            onClick={openHelp}
            data-testid="button-tradingview-sign-in"
          >
            <HelpCircle className="h-3 w-3 mr-1" />
            TV account help
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

      <TradingViewConnectHelp
        open={helpOpen}
        onOpenChange={setHelpOpen}
        onRefreshChart={onChartRefresh}
      />
    </>
  );
}
