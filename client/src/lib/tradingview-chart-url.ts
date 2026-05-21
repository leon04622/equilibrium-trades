const LS_TV_WORKSPACE = "eq_tradingview_workspace_v1";
const LS_TV_SIGNIN_STARTED = "eq_tv_signin_started";
/** Query param on return from TradingView sign-in (same-tab redirect, not iframe). */
export const TV_SESSION_RETURN_PARAM = "tv_session";

const PRODUCTION_ORIGIN = "https://www.equilibrium-trading.xyz";

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

/**
 * Minimal return URL (TradingView often ignores complex query strings and opens /chart instead).
 * Always lands on /trading on this site.
 */
export function buildTradingViewSignInReturnUrl(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN;
  const base = origin.includes("localhost") ? origin : PRODUCTION_ORIGIN;
  return `${base}/trading?${TV_SESSION_RETURN_PARAM}=1`;
}

export function markTradingViewSignInStarted(): void {
  try {
    sessionStorage.setItem(LS_TV_SIGNIN_STARTED, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function buildTradingViewSignInUrl(returnUrl?: string): string {
  const url = new URL("https://www.tradingview.com/accounts/signin/");
  url.searchParams.set(
    "return_url",
    returnUrl?.trim() || (typeof window !== "undefined" ? buildTradingViewSignInReturnUrl() : ""),
  );
  return url.toString();
}

/** After TV redirects back with ?tv_session=1, strip the param and refresh the embed. */
export function consumeTradingViewSignInReturn(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(TV_SESSION_RETURN_PARAM) !== "1") return false;
  url.searchParams.delete(TV_SESSION_RETURN_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, next);
  try {
    sessionStorage.removeItem(LS_TV_SIGNIN_STARTED);
  } catch {
    /* ignore */
  }
  return true;
}

/** User left for TV sign-in but may have landed on tradingview.com/chart — show a gentle reminder. */
export function consumeTradingViewSignInStartedReminder(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!sessionStorage.getItem(LS_TV_SIGNIN_STARTED)) return false;
    sessionStorage.removeItem(LS_TV_SIGNIN_STARTED);
    return true;
  } catch {
    return false;
  }
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
