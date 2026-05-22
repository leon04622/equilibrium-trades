/** Rabby mobile: system browsers cannot inject extensions — users must use Rabby's in-app DApp browser. */

export const RABBY_IOS_STORE =
  "https://apps.apple.com/app/rabby-wallet/id6450663781";
export const RABBY_ANDROID_STORE =
  "https://play.google.com/store/apps/details?id=com.debank.rabbymobile";

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

/** Which in-app / injected wallet environment we're running in (if any). */
export function detectWalletBrowserKind(): WalletBrowserKind {
  const eth = typeof window !== "undefined" ? (window as Window & { ethereum?: unknown }).ethereum : undefined;
  if (!eth || typeof eth !== "object") return "none";
  const p = eth as { isRabby?: boolean; isMetaMask?: boolean; request?: unknown };
  if (p.isRabby) return "rabby";
  if (p.isMetaMask) return "metamask";
  if (typeof p.request === "function") return "injected";
  return "none";
}

export function hasInjectedEthereum(): boolean {
  return detectWalletBrowserKind() !== "none";
}

export function currentSiteUrlForWalletHandoff(): string {
  const u = new URL(window.location.href);
  u.searchParams.set("eq_wallet_handoff", "rabby");
  return u.toString();
}

/** Try to open the Rabby native app with this dapp URL (may no-op if app not installed). */
export function openRabbyMobileApp(siteUrl: string): void {
  const encoded = encodeURIComponent(siteUrl);
  if (isAndroid()) {
    const fallback = encodeURIComponent(RABBY_ANDROID_STORE);
    window.location.href = `intent://dapp?url=${encoded}#Intent;scheme=rabby;package=com.debank.rabbymobile;S.browser_fallback_url=${fallback};end`;
    return;
  }
  window.location.href = `rabby://dapp?url=${encoded}`;
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
