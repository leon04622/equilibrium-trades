import { useEffect, useRef, memo } from "react";
import { useTheme } from "@/lib/theme";

interface TradingViewChartProps {
  symbol?: string;
  interval?: string;
  className?: string;
}

function TradingViewChartComponent({ 
  symbol = "BINANCE:BTCUSDT", 
  interval = "1",
  className = ""
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

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
      allow_symbol_change: true,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
      studies: [
        "MASimple@tv-basicstudies",
        "MASimple@tv-basicstudies"
      ],
      studies_overrides: {
        "moving average.length": 21,
        "moving average.plot.color": "#3b82f6",
        "moving average.plot.linewidth": 2,
      }
    });

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, interval, theme]);

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
