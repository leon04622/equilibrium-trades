import { useCallback, useEffect, useRef, useState } from "react";
import { LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  openTradingViewAuthPopup,
  persistTradingViewWorkspace,
} from "@/lib/tradingview-chart-url";

type TradingViewAccountBarProps = {
  symbol: string;
  interval: string;
  onChartRefresh: () => void;
  className?: string;
};

/**
 * TradingView blocks embedding tradingview.com/chart (frame-ancestors: none).
 * The chart on Equilibrium is the official embed widget — sign-in uses a centered popup,
 * then we refresh the embed so your session applies without leaving the platform.
 */
export function TradingViewAccountBar({
  symbol,
  interval,
  onChartRefresh,
  className,
}: TradingViewAccountBarProps) {
  const [authPending, setAuthPending] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  const connectAccount = useCallback(() => {
    persistTradingViewWorkspace(symbol, interval);
    const popup = openTradingViewAuthPopup(window.location.href);
    if (!popup) {
      setAuthPending(false);
      return;
    }
    popupRef.current = popup;
    setAuthPending(true);
    clearPoll();
    pollRef.current = setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) {
        clearPoll();
        popupRef.current = null;
        setAuthPending(false);
        onChartRefresh();
      }
    }, 500);
  }, [symbol, interval, onChartRefresh, clearPoll]);

  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-2 py-1.5 md:px-3"
      }
      data-testid="tradingview-account-bar"
    >
      <p className="text-[10px] md:text-xs text-muted-foreground leading-snug max-w-xl">
        <strong className="text-foreground font-medium">Chart stays on Equilibrium.</strong> Connect your
        TradingView account with the button — a sign-in window opens over this page (not a redirect). When you
        close it, the chart below refreshes with your session.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px] md:text-xs"
          disabled={authPending}
          onClick={connectAccount}
          data-testid="button-tradingview-sign-in"
        >
          <LogIn className="h-3 w-3 mr-1" />
          {authPending ? "Sign in open…" : "Connect TradingView"}
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
