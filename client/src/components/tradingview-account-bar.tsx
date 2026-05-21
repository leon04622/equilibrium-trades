import { useEffect, useRef, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TradingViewConnectHelp } from "@/components/tradingview-connect-help";
import {
  consumeTradingViewSignInReturn,
  persistTradingViewWorkspace,
} from "@/lib/tradingview-chart-url";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  onChartRefresh: () => void;
  onSwitchToAiChart?: () => void;
  className?: string;
};

/** Embedded TV chart — no outbound links; help dialog stays on Equilibrium. */
export function TradingViewAccountBar({
  symbol,
  interval,
  onChartRefresh,
  onSwitchToAiChart,
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
      title: "Chart refreshed",
      description: "You are back on Equilibrium. The TV embed cannot sync a TradingView website account.",
    });
  }, [onChartRefresh, toast]);

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
          <strong className="text-foreground font-medium">Chart stays on Equilibrium.</strong> Embedded
          TradingView — no account login here. Tap <strong className="text-foreground">About this chart</strong>{" "}
          if you were sent to tradingview.com by mistake.
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
            <Info className="h-3 w-3 mr-1" />
            About this chart
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
        onSwitchToAiChart={onSwitchToAiChart}
      />
    </>
  );
}
