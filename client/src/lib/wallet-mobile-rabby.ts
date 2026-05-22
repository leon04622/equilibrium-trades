/** Rabby mobile: system browsers cannot inject extensions — users must use Rabby's in-app DApp browser. */

export const RABBY_IOS_STORE =
  "https://apps.apple.com/app/rabby-wallet/id6450663781";
export const RABBY_ANDROID_STORE =
  "https://play.google.com/store/apps/details?id=com.debank.rabbymobile";

export const WALLET_HANDOFF_QS = "eq_wallet_handoff";
export const WALLET_HANDOFF_SESSION_KEY = "eq_wallet_handoff_pending";

export type WalletBrowserKind = "rabby" | "metamask" | "injected" | "none";

export function isMobileUserAgent(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getEthereum(): {
  isRabby?: boolean;
  isMetaMask?: boolean;
  request?: unknown;
} | null {
  if (typeof window === "undefined") return null;
  const eth = (window as Window & { ethereum?: unknown }).ethereum;
  if (!eth || typeof eth !== "object") return null;
  return eth as { isRabby?: boolean; isMetaMask?: boolean; request?: unknown };
}

/** Rabby Mobile WebView often includes "Rabby" in the user agent. */
export function isRabbyUserAgent(): boolean {
  return /rabby/i.test(navigator.userAgent);
}

/** Which in-app / injected wallet environment we're running in (if any). */
export function detectWalletBrowserKind(): WalletBrowserKind {
  if (isRabbyUserAgent()) return "rabby";
  const eth = getEthereum();
  if (!eth) return "none";
  if (eth.isRabby) return "rabby";
  if (eth.isMetaMask) return "metamask";
  if (typeof eth.request === "function") return "injected";
  return "none";
}

export function hasInjectedEthereum(): boolean {
  return detectWalletBrowserKind() !== "none";
}

/** True when the user is inside a wallet's in-app browser (can connect via eth_requestAccounts). */
export function isInsideWalletInAppBrowser(): boolean {
  return hasInjectedEthereum();
}

export function currentSiteUrlForWalletHandoff(wallet: "rabby" | "metamask" = "rabby"): string {
  const u = new URL(window.location.href);
  u.searchParams.set(WALLET_HANDOFF_QS, wallet);
  return u.toString();
}

/**
 * Copy Equilibrium URL for manual paste into Rabby → DApps.
 * Do NOT use rabby:// deep links — they open the app home screen, not this dapp.
 */
export async function prepareRabbyMobileHandoff(): Promise<{
  url: string;
  copied: boolean;
}> {
  const url = currentSiteUrlForWalletHandoff("rabby");
  try {
    sessionStorage.setItem(WALLET_HANDOFF_SESSION_KEY, "rabby");
    sessionStorage.removeItem("metamask_deep_link_pending");
    sessionStorage.removeItem("rabby_deep_link_pending");
  } catch {
    /* ignore */
  }
  const copied = await copyTextForUser(url);
  return { url, copied };
}

export async function copyTextForUser(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const RABBY_MOBILE_PASTE_INSTRUCTIONS =
  "Link copied. Open the Rabby app → DApps (or Websites) → paste the link → Go. On Equilibrium tap Connect Rabby and choose your account.";
