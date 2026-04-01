import { useEffect, useRef, memo, useState } from "react";
import { useTheme } from "@/lib/theme";
import { useTrading } from "@/lib/trading-context";
import { Button } from "@/components/ui/button";

/** Keys forwarded by embed-widget-advanced-chart.js (see TradingView embed script `propertiesToWorkWith`). */
const ADVANCED_CHART_SETTING_KEYS = new Set([
  "container_id",
  "symbol",
  "interval",
  "timezone",
  "theme",
  "style",
  "locale",
  "allow_symbol_change",
  "backgroundColor",
  "gridColor",
  "autosize",
  "width",
  "height",
  "hide_volume",
  "whitelabel",
  "range",
  "hide_top_toolbar",
  "hide_side_toolbar",
  "hide_legend",
  "save_image",
  "watchlist",
  "editablewatchlist",
  "studies",
  "extended_hours",
  "details",
  "hotlist",
  "hideideasbutton",
  "widgetbar_width",
  "withdateranges",
  "customer",
  "venue",
  "symbology",
  "show_popup_button",
  "popup_height",
  "popup_width",
  "studies_overrides",
  "overrides",
  "enabled_features",
  "disabled_features",
  "publish_source",
  "whotrades",
  "referral_id",
  "no_referral_id",
  "fundamental",
  "percentage",
  "padding",
  "greyText",
  "horztouchdrag",
  "verttouchdrag",
  "support_host",
  "compareSymbols",
]);

function filterAdvancedChartSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (ADVANCED_CHART_SETTING_KEYS.has(k)) out[k] = raw[k];
  }
  return out;
}

/** Mirrors TradingView embed `c()` for advanced-chart `page-uri` in the hash. */
function tradingViewPageUri(): string {
  return window.location.href.replace(/^https?:\/\//i, "");
}

const TV_RESIZE_MSG = "tv-widget-resize-iframe";
const TV_EMBED_ORIGIN = "https://www.tradingview-widget.com";

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

  const enabledIndicators = indicators.filter((i) => i.enabled);

  useEffect(() => {
    if (!containerRef.current) return;
    setLoadState("loading");

    const host = containerRef.current;
    host.innerHTML = "";

    const markReady = () => {
      setLoadState((prev) => (prev === "ready" ? prev : "ready"));
    };

    const markError = () => {
      setLoadState("error");
    };

    const studies: (string | { id: string; inputs: Record<string, unknown> })[] = [
      { id: "MASimple@tv-basicstudies", inputs: { length: 21 } },
      { id: "MASimple@tv-basicstudies", inputs: { length: 200 } },
    ];

    enabledIndicators.forEach((ind) => {
      if (ind.type === "overlay") {
        if (ind.name.toLowerCase().includes("sma")) {
          const period = ind.settings.period || 20;
          studies.push({
            id: "MASimple@tv-basicstudies",
            inputs: { length: period },
          });
        } else if (ind.name.toLowerCase().includes("ema")) {
          const period = ind.settings.period || 9;
          studies.push({
            id: "MAExp@tv-basicstudies",
            inputs: { length: period },
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
            inputs: { length: period },
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

    const raw: Record<string, unknown> = {
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_volume: hideVolume,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: false,
      support_host: "https://www.tradingview.com",
      studies,
      horztouchdrag: true,
      verttouchdrag: true,
      enabled_features: ["left_toolbar", "side_toolbar_in_fullscreen_mode"],
      width: "100%",
      height: "100%",
    };

    const settings = filterAdvancedChartSettings(raw);
    settings.utm_source = window.location.hostname;
    settings.utm_medium = "widget";
    settings.utm_campaign = "advanced-chart";

    const hashPayload: Record<string, unknown> = {};
    for (const key of Object.keys(settings)) {
      if (key === "locale" || key === "customer") continue;
      hashPayload[key] = settings[key];
    }
    hashPayload["page-uri"] = tradingViewPageUri();

    const url = new URL(`${TV_EMBED_ORIGIN}/embed-widget/advanced-chart/`);
    url.searchParams.append("locale", String(settings.locale ?? "en"));
    url.hash = encodeURIComponent(JSON.stringify(hashPayload));

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "TradingView advanced chart");
    iframe.setAttribute("lang", "en");
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("scrolling", "no");
    iframe.style.display = "block";
    iframe.style.boxSizing = "border-box";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.src = url.toString();

    const onResizeMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const msg = e.data as { name?: string; data?: { width?: number; height?: number } };
      if (msg?.name !== TV_RESIZE_MSG || !msg.data) return;
      if (msg.data.width) iframe.style.width = `${msg.data.width}px`;
      if (msg.data.height) iframe.style.height = `${msg.data.height}px`;
    };
    window.addEventListener("message", onResizeMessage);

    let loadSettled = false;
    const settleReady = () => {
      if (loadSettled) return;
      loadSettled = true;
      markReady();
    };

    iframe.onload = () => settleReady();

    host.appendChild(iframe);

    const failTimer = window.setTimeout(() => {
      if (!loadSettled) {
        markError();
      }
    }, 25_000);

    return () => {
      window.clearTimeout(failTimer);
      window.removeEventListener("message", onResizeMessage);
      loadSettled = true;
      host.innerHTML = "";
    };
  }, [
    symbol,
    interval,
    theme,
    hideVolume,
    JSON.stringify(
      enabledIndicators.map((i) => ({ id: i.id, enabled: i.enabled, settings: i.settings })),
    ),
  ]);

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
          <div className="text-center text-sm text-muted-foreground">Loading TradingView chart...</div>
        </div>
      )}
      {loadState === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
          <div className="max-w-sm text-center space-y-3">
            <p className="text-sm font-medium text-foreground">TradingView chart unavailable</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The chart frame did not load in time, or your network / browser blocked TradingView. If you use a strict
              ad blocker or VPN, try allowing TradingView. You can switch to the native chart below or reload the page.
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
