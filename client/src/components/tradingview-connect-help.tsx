import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshChart: () => void;
  onSwitchToAiChart?: () => void;
};

/**
 * Free TradingView embed cannot attach a TV account to Equilibrium.
 * We do not link to tradingview.com — that always leaves the platform (market summary, chart, etc.).
 */
export function TradingViewConnectHelp({ open, onOpenChange, onRefreshChart, onSwitchToAiChart }: Props) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>TradingView chart on Equilibrium</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            This is TradingView&apos;s <strong className="text-foreground">free embedded chart</strong>. It
            stays on this page and works without a TradingView account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">There is no account login on Equilibrium.</strong> TradingView
            does not allow third-party sites to sign you in or sync your TV profile in this embed. Any link
            inside the chart (logo, menus) opens <strong className="text-foreground">tradingview.com</strong>{" "}
            — that is expected, but it is not part of Equilibrium trading.
          </p>
          <p>
            <strong className="text-foreground">What works here:</strong> live prices, timeframes, drawing tools,
            and indicators on the embedded chart. Use <strong className="text-foreground">Refresh chart</strong> if
            the frame looks stale.
          </p>
          <p>
            <strong className="text-foreground">For full platform trading</strong> (orders, TP/SL, AI patterns),
            switch to the <strong className="text-foreground">AI</strong> chart toggle above this panel.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              onRefreshChart();
              close();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh chart
          </Button>
          {onSwitchToAiChart && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                onSwitchToAiChart();
                close();
              }}
            >
              Switch to AI chart
            </Button>
          )}
          <Button type="button" variant="ghost" className="w-full" onClick={close}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
