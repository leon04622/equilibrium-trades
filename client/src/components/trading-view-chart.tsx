import { useEffect, useRef, memo, useState } from "react";
import { useTheme } from "@/lib/theme";
import { useTrading, type Indicator } from "@/lib/trading-context";
import { Button } from "@/components/ui/button";

interface TradingViewChartProps {
  symbol?: string;
  interval?: string;
  className?: string;
  currentPrice?: number;
  hideVolume?: boolean;
  onUnavailable?: () => void;
}

function TradingViewChartComponent({ 
  symbol = "BINANCE:BTCUSDT", 
  interval = "1",
  className = "",
  currentPrice: _currentPrice = 0,
  hideVolume = false,
  onUnavailable,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { indicators } = useTrading();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const enabledIndicators = indicators.filter(i => i.enabled);

  useEffect(() => {
    if (!containerRef.current) return;
    setLoadState("loading");

    containerRef.current.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const host = containerRef.current;

    const hasRenderedWidget = () =>
      !!host.querySelector("iframe, .tradingview-widget-container iframe, .tradingview-widget-copyright");

    const markReady = () => {
      setLoadState((prev) => (prev === "ready" ? prev : "ready"));
    };

    const markError = () => {
      setLoadState("error");
      onUnavailable?.();
    };

    const studies: (string | { id: string; inputs: Record<string, any> })[] = [
      { id: "MASimple@tv-basicstudies", inputs: { length: 21 } },
      { id: "MASimple@tv-basicstudies", inputs: { length: 200 } },
    ];

    enabledIndicators.forEach((ind) => {
      if (ind.type === "overlay") {
        if (ind.name.toLowerCase().includes("sma")) {
          const period = ind.settings.period || 20;
          studies.push({
            id: "MASimple@tv-basicstudies",
            inputs: { length: period }
          });
        } else if (ind.name.toLowerCase().includes("ema")) {
          const period = ind.settings.period || 9;
          studies.push({
            id: "MAExp@tv-basicstudies",
            inputs: { length: period }
          });
        } else if (ind.name.toLowerCase().includes("bollinger")) {
          studies.push("BB@tv-basicstudies");
        } else if (ind.name.toLowerCase().includes("vwap")) {
          studies.push("VWAP@tv-basicstudies");
        } else if (ind.name.toLowerCase().includes("ichimoku")) {
          studies.push("IchimokuCloud@tv-basicstudies");
        }
      } else if (ind.type === "oscillator") {
        if (ind.name.toLowerCase().includes("rsi")) {
          const period = ind.settings.period || 14;
          studies.push({
            id: "RSI@tv-basicstudies",
            inputs: { length: period }
          });
        } else if (ind.name.toLowerCase().includes("macd")) {
          studies.push("MACD@tv-basicstudies");
        } else if (ind.name.toLowerCase().includes("stoch")) {
          studies.push("Stochastic@tv-basicstudies");
        } else if (ind.name.toLowerCase().includes("atr")) {
          studies.push("ATR@tv-basicstudies");
        }
      }
    });

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.onerror = () => {
      markError();
    };
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: interval,
      timezone: "Etc/UTC",
      theme: theme,
      style: "1",
      locale: "en",
      enable_publishing: false,
      allow_symbol_change: false,
      calendar: false,
      hide_volume: hideVolume,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: false,
      support_host: "https://www.tradingview.com",
      studies: studies,
      drawings_access: { type: "all" },
    });

    host.appendChild(script);

    const observer = new MutationObserver(() => {
      if (hasRenderedWidget()) {
        markReady();
      }
    });
    observer.observe(host, { childList: true, subtree: true });

    const successPoll = window.setInterval(() => {
      if (hasRenderedWidget()) {
        markReady();
        window.clearInterval(successPoll);
      }
    }, 400);

    const failTimer = window.setTimeout(() => {
      if (!hasRenderedWidget()) {
        window.clearInterval(successPoll);
        observer.disconnect();
        markError();
      }
    }, 7000);

    return () => {
      window.clearTimeout(failTimer);
      window.clearInterval(successPoll);
      observer.disconnect();
      if (host) {
        host.innerHTML = "";
      }
    };
  }, [symbol, interval, theme, hideVolume, onUnavailable, JSON.stringify(enabledIndicators.map(i => ({ id: i.id, enabled: i.enabled, settings: i.settings })))]);

  return (
    <div className={`tradingview-widget-container relative ${className}`}>
      <div 
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
        data-testid="tradingview-chart"
        className="h-full w-full"
      />
      {loadState === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="text-center text-sm text-muted-foreground">
            Loading TradingView chart...
          </div>
        </div>
      )}
      {loadState === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
          <div className="max-w-sm text-center space-y-3">
            <p className="text-sm font-medium text-foreground">TradingView chart unavailable</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This market or browser is not loading the TradingView embed right now. Switch back to the AI chart to keep trading.
            </p>
            <Button size="sm" variant="outline" onClick={() => onUnavailable?.()}>
              Use AI chart instead
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartComponent);
