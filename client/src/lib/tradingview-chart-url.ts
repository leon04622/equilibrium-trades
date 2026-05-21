const LS_TV_WORKSPACE = "eq_tradingview_workspace_v1";

export type TradingViewWorkspace = {
  symbol: string;
  interval: string;
  updatedAt: number;
};

/** TradingView chart interval codes (1, 5, 15, 60, D, …). */
export function tradingTimeframeToTvInterval(tf: string): string {
  const t = tf.trim();
  if (t === "D" || t === "1D") return "D";
  if (/^\d+$/.test(t)) return t;
  const m = /^(\d+)m$/i.exec(t);
  if (m) return m[1];
  const h = /^(\d+)h$/i.exec(t);
  if (h) return String(Number(h[1]) * 60);
  return "5";
}

export function buildTradingViewFullChartUrl(symbol: string, interval?: string): string {
  const url = new URL("https://www.tradingview.com/chart/");
  url.searchParams.set("symbol", symbol.trim());
  if (interval?.trim()) {
    url.searchParams.set("interval", tradingTimeframeToTvInterval(interval));
  }
  return url.toString();
}

/** After sign-in, return user to the same Equilibrium page (chart stays embedded). */
export function buildTradingViewSignInUrl(returnUrl?: string): string {
  const url = new URL("https://www.tradingview.com/accounts/signin/");
  url.searchParams.set("return_url", returnUrl?.trim() || window.location.href);
  return url.toString();
}

/**
 * Centered popup (not a new tab) — TradingView blocks iframe embed of their site,
 * but cookies on `.tradingview.com` can apply to the embedded widget after sign-in.
 */
export function openTradingViewAuthPopup(returnUrl?: string): Window | null {
  const w = 520;
  const h = 740;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=yes",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
  return window.open(buildTradingViewSignInUrl(returnUrl), "equilibrium_tradingview_auth", features);
}

export function persistTradingViewWorkspace(symbol: string, interval: string): void {
  try {
    const payload: TradingViewWorkspace = {
      symbol: symbol.trim(),
      interval: tradingTimeframeToTvInterval(interval),
      updatedAt: Date.now(),
    };
    localStorage.setItem(LS_TV_WORKSPACE, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readTradingViewWorkspace(): TradingViewWorkspace | null {
  try {
    const raw = localStorage.getItem(LS_TV_WORKSPACE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TradingViewWorkspace>;
    if (typeof parsed.symbol !== "string" || !parsed.symbol.trim()) return null;
    return {
      symbol: parsed.symbol.trim(),
      interval: tradingTimeframeToTvInterval(String(parsed.interval ?? "5")),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Stable embed key so the free widget can restore layout per route (not per query string). */
export function tradingViewEmbedPageUri(): string {
  const { hostname, pathname } = window.location;
  return `${hostname}${pathname}`;
}
