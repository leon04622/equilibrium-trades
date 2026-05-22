import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  trySetReferrer,
  ensureHyperliquidTradingSession,
  isHyperliquidTradingSessionReady,
  clearHyperliquidTradingSession,
} from "@/lib/hyperliquid-client";
import { hasLocalLifetimeHandshakeDone } from "@/lib/TradeExecution";
import { syncCrmBuilderLinkIfSessionReady } from "@/lib/crm-builder-link-sync";
import { queryClient } from "@/lib/queryClient";
import { humanizeWalletConnectError } from "@/lib/wallet-errors";
import {
  readAuthorizedAccounts,
  requestAccountsFromProvider,
} from "@/lib/wallet-connect-flow";
import {
  currentSiteUrlForWalletHandoff,
  detectWalletBrowserKind,
  isInsideWalletInAppBrowser,
  isMobileUserAgent,
  prepareRabbyMobileHandoff,
  RABBY_MOBILE_PASTE_INSTRUCTIONS,
  type WalletBrowserKind,
} from "@/lib/wallet-mobile-rabby";

export type WalletType = "metamask" | "rabby" | "okx" | "coinbase" | "trust" | "phantom" | "injected" | "none";

export interface DetectedWallet {
  type: WalletType;
  name: string;
  icon?: string;
  provider?: any;
}

interface WalletContextType {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  builderCodeApproved: boolean;
  isCheckingApproval: boolean;
  /** Delegated trading agent + builder fee approved locally; orders use agent signing only. */
  hyperliquidSessionReady: boolean;
  isPreparingHyperliquidSession: boolean;
  prepareHyperliquidSession: () => Promise<{ success: boolean; error?: string }>;
  detectedWallets: DetectedWallet[];
  isMobile: boolean;
  /** Injected wallet environment when inside Rabby/MetaMask in-app browser. */
  walletBrowserKind: WalletBrowserKind;
  hasInjectedProvider: boolean;
  copySiteUrlForRabbyWallet: () => Promise<boolean>;
  rabbyPasteHandoffActive: boolean;
  prepareRabbyPasteHandoff: () => Promise<{ copied: boolean }>;
  connectError: string | null;
  clearConnectError: () => void;
  pendingConnectAccounts: string[] | null;
  pendingConnectWalletName: string | null;
  confirmConnectAccount: (account: string) => Promise<void>;
  cancelPendingConnect: () => void;
  connect: (
    walletType?: WalletType,
    options?: { forceAccountPicker?: boolean },
  ) => Promise<void>;
  disconnect: () => void;
  switchToArbitrum: () => Promise<void>;
  refreshApprovalStatus: () => Promise<void>;
  /** Call right after POST /approve-builder-code succeeds so UI unlocks before the next GET round-trip. */
  confirmBuilderCodeApproved: () => void;
  openInWalletBrowser: (walletType: WalletType) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const ARBITRUM_CHAIN_ID = 42161;

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
      isMetaMask?: boolean;
      isRabby?: boolean;
      isOkxWallet?: boolean;
      isCoinbaseWallet?: boolean;
      isTrust?: boolean;
      providers?: any[];
    };
    okxwallet?: any;
    phantom?: { ethereum?: any };
    coinbaseWalletExtension?: any;
  }
}

function detectMobile(): boolean {
  return isMobileUserAgent();
}

function getWalletInfo(provider: any): { type: WalletType; name: string } | null {
  if (!provider) return null;
  // Order matters — Rabby also sets isMetaMask, so check it first
  if (provider.isRabby)           return { type: "rabby",    name: "Rabby Wallet" };
  if (provider.isOkxWallet)       return { type: "okx",      name: "OKX Wallet" };
  if (provider.isCoinbaseWallet)  return { type: "coinbase", name: "Coinbase Wallet" };
  if (provider.isTrust)           return { type: "trust",    name: "Trust Wallet" };
  if (provider.isMetaMask)        return { type: "metamask", name: "MetaMask" };
  return { type: "injected", name: "Browser Wallet" };
}

function detectWallets(): DetectedWallet[] {
  const wallets: DetectedWallet[] = [];
  const seen = new Set<string>();

  const addWallet = (provider: any) => {
    const info = getWalletInfo(provider);
    if (!info) return;
    if (seen.has(info.type)) return;
    seen.add(info.type);
    wallets.push({ ...info, provider });
  };

  // Check standalone OKX wallet object
  if (window.okxwallet) {
    addWallet({ ...window.okxwallet, isOkxWallet: true });
  }

  // Check Phantom EVM
  if (window.phantom?.ethereum) {
    wallets.push({ type: "phantom" as WalletType, name: "Phantom", provider: window.phantom.ethereum });
    seen.add("phantom");
  }

  if (!window.ethereum) return wallets;

  // Multi-provider array (EIP-5749 / MetaMask conflict resolution)
  if (window.ethereum.providers?.length) {
    for (const p of window.ethereum.providers) {
      addWallet(p);
    }
  } else {
    addWallet(window.ethereum);
  }

  return wallets;
}

/** EIP-6963: map wallet rdns to our WalletType + display name */
function mapEip6963Rdns(rdns: string, displayName: string): Pick<DetectedWallet, "type" | "name"> {
  switch (rdns) {
    case "io.rabby":
      return { type: "rabby", name: "Rabby Wallet" };
    case "io.metamask":
      return { type: "metamask", name: "MetaMask" };
    case "com.coinbase.wallet":
      return { type: "coinbase", name: displayName || "Coinbase Wallet" };
    default:
      if (/okx|okex/i.test(rdns)) return { type: "okx", name: displayName || "OKX Wallet" };
      if (/trust/i.test(rdns)) return { type: "trust", name: displayName || "Trust Wallet" };
      return { type: "injected", name: displayName || "Wallet" };
  }
}

const WALLET_LIST_ORDER: WalletType[] = [
  "rabby",
  "metamask",
  "coinbase",
  "okx",
  "trust",
  "phantom",
  "injected",
];

function mergeDetectedWallets(eip6963ByRdns: Map<string, DetectedWallet>): DetectedWallet[] {
  const legacy = detectWallets();
  const byType = new Map<WalletType, DetectedWallet>();

  for (const w of legacy) {
    if (!byType.has(w.type)) byType.set(w.type, w);
  }
  for (const w of eip6963ByRdns.values()) {
    const prev = byType.get(w.type);
    byType.set(w.type, {
      type: w.type,
      name: w.name || prev?.name || "Wallet",
      icon: w.icon ?? prev?.icon,
      provider: w.provider ?? prev?.provider,
    });
  }

  const out: DetectedWallet[] = [];
  const used = new Set<WalletType>();
  for (const t of WALLET_LIST_ORDER) {
    const w = byType.get(t);
    if (w) {
      out.push(w);
      used.add(t);
    }
  }
  for (const w of byType.values()) {
    if (!used.has(w.type)) out.push(w);
  }
  return out;
}

function resolveInjectedProvider(
  walletType: WalletType | undefined,
  eip6963ByRdns: Map<string, DetectedWallet>
): any | null {
  const from6963 = () => [...eip6963ByRdns.values()];

  if (walletType && walletType !== "injected") {
    const hit = from6963().find((w) => w.type === walletType);
    if (hit?.provider) return hit.provider;
    if (walletType === "okx" && window.okxwallet) return window.okxwallet;
    if (walletType === "phantom" && window.phantom?.ethereum) return window.phantom.ethereum;
    if (window.ethereum?.providers?.length) {
      for (const p of window.ethereum.providers) {
        if (getWalletInfo(p)?.type === walletType) return p;
      }
    }
    if (getWalletInfo(window.ethereum)?.type === walletType) return window.ethereum;
    // Rabby mobile often exposes only isMetaMask ("disguise as MetaMask")
    if (walletType === "rabby" && window.ethereum?.request) return window.ethereum;
    return null;
  }

  const rabby6963 = from6963().find((w) => w.type === "rabby");
  if (rabby6963?.provider) return rabby6963.provider;
  const mm6963 = from6963().find((w) => w.type === "metamask");
  if (mm6963?.provider) return mm6963.provider;

  const list = detectWallets();
  const rabbyLegacy = list.find((w) => w.type === "rabby");
  if (rabbyLegacy?.provider) return rabbyLegacy.provider;
  const mmLegacy = list.find((w) => w.type === "metamask");
  if (mmLegacy?.provider) return mmLegacy.provider;

  if (window.ethereum?.providers?.length) {
    const rp = window.ethereum.providers.find((p: any) => p?.isRabby);
    if (rp) return rp;
  }
  return window.ethereum ?? null;
}

const WALLET_DISCONNECTED_KEY = 'wallet_user_disconnected';
/** Query + sessionStorage: survives Safari/Chrome → Rabby WebView where storage from the system browser does not. */
const WALLET_HANDOFF_QS = "eq_wallet_handoff";
const WALLET_HANDOFF_SESSION_KEY = "eq_wallet_handoff_pending";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [builderCodeApproved, setBuilderCodeApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [hyperliquidSessionReady, setHyperliquidSessionReady] = useState(false);
  const [isPreparingHyperliquidSession, setIsPreparingHyperliquidSession] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [walletBrowserKind, setWalletBrowserKind] = useState<WalletBrowserKind>("none");
  const [rabbyPasteHandoffActive, setRabbyPasteHandoffActive] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingConnectAccounts, setPendingConnectAccounts] = useState<string[] | null>(null);
  const [pendingConnectWalletName, setPendingConnectWalletName] = useState<string | null>(null);
  const eip6963MapRef = useRef(new Map<string, DetectedWallet>());
  const activeInjectedRef = useRef<any>(null);
  const pendingProviderRef = useRef<any>(null);

  const isConnected = !!address && !!signer;

  const bindInjectedWalletSession = useCallback(async (raw: any, accountAddress?: string) => {
    activeInjectedRef.current = raw;
    const browserProvider = new BrowserProvider(raw);
    const browserSigner = accountAddress
      ? await browserProvider.getSigner(accountAddress)
      : await browserProvider.getSigner();
    let chainId: number | null = null;
    try {
      const chainHex = await raw.request({ method: "eth_chainId" });
      if (typeof chainHex === "string" && chainHex.startsWith("0x")) {
        const id = parseInt(chainHex, 16);
        if (Number.isFinite(id)) chainId = id;
      }
    } catch {
      /* ignore */
    }
    if (chainId == null) {
      try {
        const network = await browserProvider.getNetwork();
        chainId = Number(network.chainId);
      } catch (netErr) {
        console.warn("[Wallet] Network read deferred (will sync on chainChanged):", netErr);
      }
    }
    return { browserProvider, browserSigner, chainId };
  }, []);

  const clearConnectError = useCallback(() => setConnectError(null), []);

  const cancelPendingConnect = useCallback(() => {
    setPendingConnectAccounts(null);
    setPendingConnectWalletName(null);
    pendingProviderRef.current = null;
  }, []);

  const completeInjectedConnect = useCallback(
    async (raw: any, account: string, walletLabel: string) => {
      const normalized = account.toLowerCase();
      const { browserProvider, browserSigner, chainId } =
        await bindInjectedWalletSession(raw, normalized);
      setProvider(browserProvider);
      setSigner(browserSigner);
      setAddress(normalized);
      if (chainId != null) setChainId(chainId);
      setPendingConnectAccounts(null);
      setPendingConnectWalletName(null);
      pendingProviderRef.current = null;
      setConnectError(null);
      setRabbyPasteHandoffActive(false);
      console.info(`[Wallet] Connected ${normalized.slice(0, 6)}… via ${walletLabel}`);
    },
    [bindInjectedWalletSession],
  );

  const confirmConnectAccount = useCallback(
    async (account: string) => {
      const raw = pendingProviderRef.current;
      if (!raw) {
        setConnectError("Connection session expired. Please connect again.");
        cancelPendingConnect();
        return;
      }
      setIsConnecting(true);
      try {
        await completeInjectedConnect(
          raw,
          account,
          pendingConnectWalletName ?? "Wallet",
        );
      } catch (error: unknown) {
        console.error("Error confirming wallet account:", error);
        setConnectError(humanizeWalletConnectError(error));
        throw error;
      } finally {
        setIsConnecting(false);
      }
    },
    [completeInjectedConnect, pendingConnectWalletName, cancelPendingConnect],
  );

  const rebuildDetectedWallets = useCallback(() => {
    setDetectedWallets(mergeDetectedWallets(eip6963MapRef.current));
    setWalletBrowserKind(detectWalletBrowserKind());
  }, []);

  const copySiteUrlForRabbyWallet = useCallback(async () => {
    const { copied } = await prepareRabbyMobileHandoff();
    return copied;
  }, []);

  const prepareRabbyPasteHandoff = useCallback(async () => {
    const { copied } = await prepareRabbyMobileHandoff();
    setRabbyPasteHandoffActive(true);
    setConnectError(
      copied
        ? RABBY_MOBILE_PASTE_INSTRUCTIONS
        : "Copy the site link, open Rabby → DApps, paste it, then tap Connect Rabby on Equilibrium.",
    );
    return { copied };
  }, []);

  // EIP-6963 + legacy detection; Rabby is sorted before MetaMask when both exist
  useEffect(() => {
    setIsMobile(detectMobile());
    rebuildDetectedWallets();

    const on6963 = (event: Event) => {
      const e = event as CustomEvent<{ info?: { rdns: string; name: string }; provider?: any }>;
      const { info, provider } = e.detail ?? {};
      if (!info?.rdns || !provider) return;
      const mapped = mapEip6963Rdns(info.rdns, info.name);
      eip6963MapRef.current.set(info.rdns, { ...mapped, provider });
      rebuildDetectedWallets();
    };

    window.addEventListener("eip6963:announceProvider", on6963);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const retryTimer = setTimeout(rebuildDetectedWallets, 800);
    const retryTimer2 = setTimeout(rebuildDetectedWallets, 2000);
    const retryTimer3 = setTimeout(rebuildDetectedWallets, 4500);

    return () => {
      clearTimeout(retryTimer);
      clearTimeout(retryTimer2);
      clearTimeout(retryTimer3);
      window.removeEventListener("eip6963:announceProvider", on6963);
    };
  }, [rebuildDetectedWallets]);

  /** Inside Rabby in-app browser on mobile: auto-start connect handoff. */
  useEffect(() => {
    if (!isMobile || address) return;
    if (localStorage.getItem(WALLET_DISCONNECTED_KEY) === "true") return;
    const kind = detectWalletBrowserKind();
    if (kind !== "rabby" && kind !== "metamask" && kind !== "injected") return;
    try {
      const existing = sessionStorage.getItem(WALLET_HANDOFF_SESSION_KEY);
      if (!existing) {
        sessionStorage.setItem(
          WALLET_HANDOFF_SESSION_KEY,
          kind === "metamask" ? "metamask" : "rabby",
        );
      }
    } catch {
      /* ignore */
    }
  }, [isMobile, address]);

  /**
   * Mobile: opening Rabby/MetaMask from system browser loads this URL in the wallet WebView.
   * `sessionStorage` set *before* the handoff does not carry over, so we add `?eq_wallet_handoff=rabby`
   * (mirrored into sessionStorage here) and retry `eth_requestAccounts` until EIP-6963 exposes the provider.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(WALLET_DISCONNECTED_KEY) === "true") return;
    if (address) {
      try {
        sessionStorage.removeItem(WALLET_HANDOFF_SESSION_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const url = new URL(window.location.href);
      let fromUrl = url.searchParams.get(WALLET_HANDOFF_QS);
      if (!fromUrl && url.hash.length > 1) {
        const hp = new URLSearchParams(url.hash.slice(1));
        fromUrl = hp.get(WALLET_HANDOFF_QS);
      }
      if (fromUrl === "rabby" || fromUrl === "metamask") {
        url.searchParams.delete(WALLET_HANDOFF_QS);
        if (url.hash.length > 1) {
          const hp = new URLSearchParams(url.hash.slice(1));
          hp.delete(WALLET_HANDOFF_QS);
          const rest = hp.toString();
          url.hash = rest ? `#${rest}` : "";
        }
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, document.title, next);
        sessionStorage.setItem(WALLET_HANDOFF_SESSION_KEY, fromUrl);
      }
    } catch {
      /* ignore invalid URL */
    }

    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(WALLET_HANDOFF_SESSION_KEY);
    } catch {
      pending = null;
    }
    if (pending !== "rabby" && pending !== "metamask") return;

    const walletType = pending as "rabby" | "metamask";
    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < 24; attempt++) {
        if (cancelled || localStorage.getItem(WALLET_DISCONNECTED_KEY) === "true") return;

        window.dispatchEvent(new Event("eip6963:requestProvider"));
        rebuildDetectedWallets();

        const rawProvider = resolveInjectedProvider(walletType, eip6963MapRef.current);
        if (rawProvider?.request) {
          try {
            setIsConnecting(true);
            const accounts = await requestAccountsFromProvider(rawProvider, {
              forceAccountPicker: !isMobileUserAgent(),
            });
            if (accounts.length >= 1) {
              if (accounts.length === 1) {
                await completeInjectedConnect(
                  rawProvider,
                  accounts[0],
                  walletType === "rabby" ? "Rabby Wallet" : "MetaMask",
                );
              } else {
                pendingProviderRef.current = rawProvider;
                setPendingConnectAccounts(accounts);
                setPendingConnectWalletName(
                  walletType === "rabby" ? "Rabby Wallet" : "MetaMask",
                );
              }
              try {
                sessionStorage.removeItem(WALLET_HANDOFF_SESSION_KEY);
                sessionStorage.removeItem("metamask_deep_link_pending");
                sessionStorage.removeItem("rabby_deep_link_pending");
              } catch {
                /* ignore */
              }
              return;
            }
          } catch (err) {
            console.warn("[Wallet] Mobile handoff connect attempt:", err);
          } finally {
            setIsConnecting(false);
          }
        }

        await new Promise((r) => setTimeout(r, 450));
      }
      try {
        sessionStorage.removeItem(WALLET_HANDOFF_SESSION_KEY);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, completeInjectedConnect, rebuildDetectedWallets]);

  const confirmBuilderCodeApproved = useCallback(() => {
    setBuilderCodeApproved(true);
  }, []);

  const refreshApprovalStatus = useCallback(async () => {
    if (!address) {
      setBuilderCodeApproved(false);
      return;
    }
    
    setIsCheckingApproval(true);
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), 20_000);
    try {
      let response = await fetch(`/api/wallet-user/${address}`, { signal: ac.signal });
      let data = await response.json();

      if (!data.exists) {
        try {
          await fetch("/api/wallet-user/register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": address,
              Authorization: `Bearer ${address}`,
            },
            credentials: "include",
            body: JSON.stringify({ walletAddress: address }),
            signal: ac.signal,
          });
          response = await fetch(`/api/wallet-user/${address}`, { signal: ac.signal });
          data = await response.json();
        } catch (regError) {
          console.error("Error auto-registering wallet user:", regError);
        }
      }

      setBuilderCodeApproved(Boolean(data.exists && data.builderCodeApproved));
    } catch (error) {
      console.error("Error checking approval status:", error);
      setBuilderCodeApproved((prev) => prev || hasLocalLifetimeHandshakeDone(address));
    } finally {
      clearTimeout(t);
      setIsCheckingApproval(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      refreshApprovalStatus();
    } else {
      setBuilderCodeApproved(false);
    }
  }, [address, refreshApprovalStatus]);

  // Refresh from localStorage when the wallet address changes (silent re-auth after page reload).
  useEffect(() => {
    if (!address) {
      setHyperliquidSessionReady(false);
      return;
    }
    setHyperliquidSessionReady(isHyperliquidTradingSessionReady(address));
  }, [address]);

  const prepareHyperliquidSession = useCallback(async () => {
    if (!signer || !address) {
      return { success: false, error: "Wallet not connected" };
    }
    setIsPreparingHyperliquidSession(true);
    try {
      const result = await ensureHyperliquidTradingSession(signer);
      if (result.success) {
        setHyperliquidSessionReady(true);
        await trySetReferrer(signer);
        void syncCrmBuilderLinkIfSessionReady(address);
      } else {
        setHyperliquidSessionReady(isHyperliquidTradingSessionReady(address));
      }
      return result;
    } finally {
      setIsPreparingHyperliquidSession(false);
    }
  }, [signer, address]);

  // Sync HL agent from localStorage; silently re-validate when handshake was done before (no modal).
  useEffect(() => {
    if (!signer || !address || isCheckingApproval) return;
    if (isHyperliquidTradingSessionReady(address)) {
      setHyperliquidSessionReady(true);
      trySetReferrer(signer).catch(() => {});
      void syncCrmBuilderLinkIfSessionReady(address);
      return;
    }
    const mayRestore =
      builderCodeApproved || hasLocalLifetimeHandshakeDone(address);
    if (!mayRestore) return;
    let cancelled = false;
    void ensureHyperliquidTradingSession(signer).then((result) => {
      if (cancelled) return;
      if (result.success || isHyperliquidTradingSessionReady(address)) {
        setHyperliquidSessionReady(true);
        trySetReferrer(signer).catch(() => {});
        void syncCrmBuilderLinkIfSessionReady(address);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signer, address, builderCodeApproved, isCheckingApproval]);

  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
    const raw = activeInjectedRef.current ?? window.ethereum;
    if (accounts.length === 0) {
      setAddress(null);
      setSigner(null);
      setProvider(null);
      activeInjectedRef.current = null;
    } else {
      const next = accounts[0].toLowerCase();
      setAddress(next);
      if (raw) {
        try {
          const { browserProvider, browserSigner } = await bindInjectedWalletSession(raw, next);
          setProvider(browserProvider);
          setSigner(browserSigner);
        } catch (err) {
          console.error("Error refreshing signer after account change:", err);
        }
      }
    }
  }, [bindInjectedWalletSession]);

  const handleChainChanged = useCallback(async (chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    setChainId(newChainId);
    const raw = activeInjectedRef.current ?? window.ethereum;
    if (raw) {
      try {
        const { browserProvider, browserSigner } = await bindInjectedWalletSession(raw);
        setProvider(browserProvider);
        setSigner(browserSigner);
      } catch (error) {
        console.error("Error reinitializing provider after chain change:", error);
      }
    }
  }, [bindInjectedWalletSession]);

  useEffect(() => {
    const raw = activeInjectedRef.current ?? window.ethereum;
    if (!raw?.on) return;

    raw.on("accountsChanged", handleAccountsChanged);
    raw.on("chainChanged", handleChainChanged);

    return () => {
      raw.removeListener?.("accountsChanged", handleAccountsChanged);
      raw.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged, address]);

  useEffect(() => {
    const checkConnection = async () => {
      const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
      if (wasDisconnected) return;

      const raw =
        resolveInjectedProvider(undefined, eip6963MapRef.current) ?? window.ethereum;
      if (!raw?.request) return;

      try {
        const accounts = await readAuthorizedAccounts(raw);
        if (accounts.length === 1) {
          await completeInjectedConnect(raw, accounts[0], "Saved session");
        } else if (accounts.length > 1) {
          pendingProviderRef.current = raw;
          setPendingConnectAccounts(accounts);
          setPendingConnectWalletName("Wallet");
        } else if (isMobile && window.ethereum) {
          const mmPending = sessionStorage.getItem("metamask_deep_link_pending");
          const rbPending = sessionStorage.getItem("rabby_deep_link_pending");
          const eth = window.ethereum;
          const tryDeepLink =
            (mmPending && Boolean(eth.isMetaMask) && !eth.isRabby) ||
            (rbPending && Boolean(eth.isRabby));
          if (tryDeepLink) {
            sessionStorage.removeItem("metamask_deep_link_pending");
            sessionStorage.removeItem("rabby_deep_link_pending");
            try {
              setIsConnecting(true);
              const requestedAccounts = await requestAccountsFromProvider(raw, {
                forceAccountPicker: !isMobileUserAgent(),
              });
              if (requestedAccounts.length === 1) {
                await completeInjectedConnect(raw, requestedAccounts[0], "Wallet app");
              } else if (requestedAccounts.length > 1) {
                pendingProviderRef.current = raw;
                setPendingConnectAccounts(requestedAccounts);
                setPendingConnectWalletName("Wallet app");
              }
            } catch (err) {
              console.error("Error auto-connecting after wallet deep link:", err);
            } finally {
              setIsConnecting(false);
            }
          }
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
      }
    };

    checkConnection();
  }, [isMobile, completeInjectedConnect]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
      if (wasDisconnected) return;
      
      if (document.visibilityState === "visible" && isMobile && !address) {
        let handoffStored: string | null = null;
        try {
          handoffStored = sessionStorage.getItem(WALLET_HANDOFF_SESSION_KEY);
        } catch {
          handoffStored = null;
        }
        const pendingHandoff =
          handoffStored === "rabby" || handoffStored === "metamask" ? handoffStored : null;

        const raw =
          (pendingHandoff
            ? resolveInjectedProvider(pendingHandoff, eip6963MapRef.current)
            : null) ??
          resolveInjectedProvider(undefined, eip6963MapRef.current) ??
          window.ethereum;
        if (!raw?.request) return;
        try {
          const accounts = await readAuthorizedAccounts(raw);
          if (accounts.length === 1) {
            await completeInjectedConnect(raw, accounts[0], "Wallet app");
            try {
              sessionStorage.removeItem(WALLET_HANDOFF_SESSION_KEY);
            } catch {
              /* ignore */
            }
          } else if (accounts.length > 1) {
            pendingProviderRef.current = raw;
            setPendingConnectAccounts(accounts);
            setPendingConnectWalletName("Wallet app");
          }
        } catch (error) {
          console.error("Error reconnecting on visibility change:", error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isMobile, address, completeInjectedConnect]);

  const openInWalletBrowser = useCallback((walletType: WalletType) => {
    const u = new URL(window.location.href);

    if (walletType === "metamask") {
      u.searchParams.set(WALLET_HANDOFF_QS, "metamask");
      const hp = new URLSearchParams(u.hash.startsWith("#") ? u.hash.slice(1) : "");
      hp.set(WALLET_HANDOFF_QS, "metamask");
      u.hash = hp.toString() ? `#${hp.toString()}` : `#${WALLET_HANDOFF_QS}=metamask`;
      try {
        sessionStorage.setItem("metamask_deep_link_pending", "true");
        sessionStorage.removeItem("rabby_deep_link_pending");
      } catch {
        /* ignore */
      }
      const fullUrl = u.toString();
      window.location.href = `https://metamask.app.link/dapp/${encodeURIComponent(fullUrl)}`;
      return;
    }
    if (walletType === "rabby") {
      void prepareRabbyPasteHandoff();
      return;
    }
    alert("Open this site in your wallet app's browser (DApp / Discover), then use Connect Wallet.");
  }, [prepareRabbyPasteHandoff]);

  const connect = useCallback(async (
    walletType?: WalletType,
    options?: { forceAccountPicker?: boolean },
  ) => {
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setConnectError(null);
    cancelPendingConnect();

    const fromList =
      walletType && walletType !== "injected"
        ? detectedWallets.find((w) => w.type === walletType)?.provider
        : undefined;
    const selectedProvider =
      fromList ??
      (walletType ? null : activeInjectedRef.current) ??
      resolveInjectedProvider(walletType, eip6963MapRef.current);

    if (!selectedProvider?.request) {
      if (isMobile && (walletType === "rabby" || walletType === undefined)) {
        await prepareRabbyPasteHandoff();
        return;
      } else if (isMobile) {
        setConnectError(
          "No wallet in this browser. Copy the site link, open Rabby → DApps, paste the URL, then tap Connect Rabby.",
        );
      } else {
        setConnectError(
          "No wallet detected. Install Rabby or MetaMask (or another EVM wallet), refresh, then try again."
        );
      }
      return;
    }

    let walletLabel =
      (walletType && detectedWallets.find((w) => w.type === walletType)?.name) ||
      getWalletInfo(selectedProvider)?.name ||
      "Wallet";
    if (walletType === "rabby" && !selectedProvider?.isRabby && selectedProvider?.isMetaMask) {
      walletLabel = "Rabby Wallet";
    }

    setIsConnecting(true);

    try {
      const existing = await readAuthorizedAccounts(selectedProvider);
      const accounts = await requestAccountsFromProvider(selectedProvider, {
        forceAccountPicker:
          isMobile && existing.length > 1
            ? true
            : isMobile
              ? false
              : (options?.forceAccountPicker ?? true),
      });

      if (accounts.length === 0) {
        throw new Error("No accounts returned. Unlock your wallet, pick an account, and try again.");
      }

      if (accounts.length === 1) {
        await completeInjectedConnect(selectedProvider, accounts[0], walletLabel);
        return;
      }

      pendingProviderRef.current = selectedProvider;
      setPendingConnectAccounts(accounts);
      setPendingConnectWalletName(walletLabel);
    } catch (error: unknown) {
      console.error("Error connecting wallet:", error);
      const message = humanizeWalletConnectError(error);
      setConnectError(message);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [isMobile, detectedWallets, completeInjectedConnect, cancelPendingConnect, prepareRabbyPasteHandoff]);

  const disconnect = useCallback(() => {
    const prev = address;
    localStorage.setItem(WALLET_DISCONNECTED_KEY, 'true');
    try {
      sessionStorage.removeItem(WALLET_HANDOFF_SESSION_KEY);
      sessionStorage.removeItem("metamask_deep_link_pending");
      sessionStorage.removeItem("rabby_deep_link_pending");
    } catch {
      /* ignore */
    }
    activeInjectedRef.current = null;
    pendingProviderRef.current = null;
    setPendingConnectAccounts(null);
    setPendingConnectWalletName(null);
    if (prev) {
      clearHyperliquidTradingSession(prev);
    }
    /** Clear cached hydration only — Mongo/Postgres rows are untouched. */
    void queryClient.removeQueries({ queryKey: ["/api/user/sync"] });
    void queryClient.removeQueries({ queryKey: ["/api/user-status"] });
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setBuilderCodeApproved(false);
    setHyperliquidSessionReady(false);
    setConnectError(null);
    setRabbyPasteHandoffActive(false);
  }, [address]);

  const switchToArbitrum = useCallback(async () => {
    const raw = activeInjectedRef.current ?? window.ethereum;
    if (!raw?.request) return;

    try {
      await raw.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        await raw.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}`,
            chainName: "Arbitrum One",
            nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://arb1.arbitrum.io/rpc"],
            blockExplorerUrls: ["https://arbiscan.io/"],
          }],
        });
      } else {
        throw error;
      }
    }
  }, []);

  return (
    <WalletContext.Provider value={{
      address,
      chainId,
      isConnecting,
      isConnected,
      signer,
      provider,
      builderCodeApproved,
      isCheckingApproval,
      hyperliquidSessionReady,
      isPreparingHyperliquidSession,
      prepareHyperliquidSession,
      detectedWallets,
      isMobile,
      walletBrowserKind,
      hasInjectedProvider: isInsideWalletInAppBrowser(),
      copySiteUrlForRabbyWallet,
      rabbyPasteHandoffActive,
      prepareRabbyPasteHandoff,
      connectError,
      clearConnectError,
      pendingConnectAccounts,
      pendingConnectWalletName,
      confirmConnectAccount,
      cancelPendingConnect,
      connect,
      disconnect,
      switchToArbitrum,
      refreshApprovalStatus,
      confirmBuilderCodeApproved,
      openInWalletBrowser,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
