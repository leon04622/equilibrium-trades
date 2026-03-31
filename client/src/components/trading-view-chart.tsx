import { useEffect, useRef, memo } from "react";
import { useTheme } from "@/lib/theme";
import { useTrading, type Indicator } from "@/lib/trading-context";

interface TradingViewChartProps {
  symbol?: string;
  interval?: string;
  className?: string;
  currentPrice?: number;
  hideVolume?: boolean;
}

function TradingViewChartComponent({ 
  symbol = "BINANCE:BTCUSDT", 
  interval = "1",
  className = "",
  currentPrice: _currentPrice = 0,
  hideVolume = false,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { indicators } = useTrading();

  const enabledIndicators = indicators.filter(i => i.enabled);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

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

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, interval, theme, hideVolume, JSON.stringify(enabledIndicators.map(i => ({ id: i.id, enabled: i.enabled, settings: i.settings })))]);

  return (
    <div 
      className={`tradingview-widget-container ${className}`}
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
      data-testid="tradingview-chart"
    />
  );
}

export const TradingViewChart = memo(TradingViewChartComponent);
