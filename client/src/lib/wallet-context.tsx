import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  trySetReferrer,
  ensureHyperliquidTradingSession,
  isHyperliquidTradingSessionReady,
  clearHyperliquidTradingSession,
} from "@/lib/hyperliquid-client";

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
  /** Hyperliquid delegated agent + builder fee approved locally; orders use agent signing only. */
  hyperliquidSessionReady: boolean;
  isPreparingHyperliquidSession: boolean;
  prepareHyperliquidSession: () => Promise<{ success: boolean; error?: string }>;
  detectedWallets: DetectedWallet[];
  isMobile: boolean;
  connectError: string | null;
  connect: (walletType?: WalletType) => Promise<void>;
  disconnect: () => void;
  switchToArbitrum: () => Promise<void>;
  refreshApprovalStatus: () => Promise<void>;
  openInWalletBrowser: (walletType: WalletType) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const ARBITRUM_CHAIN_ID = 42161;

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
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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
  const [connectError, setConnectError] = useState<string | null>(null);
  const eip6963MapRef = useRef(new Map<string, DetectedWallet>());
  const activeInjectedRef = useRef<any>(null);

  const isConnected = !!address && !!signer;

  const rebuildDetectedWallets = useCallback(() => {
    setDetectedWallets(mergeDetectedWallets(eip6963MapRef.current));
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

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener("eip6963:announceProvider", on6963);
    };
  }, [rebuildDetectedWallets]);

  const refreshApprovalStatus = useCallback(async () => {
    if (!address) {
      setBuilderCodeApproved(false);
      return;
    }
    
    setIsCheckingApproval(true);
    try {
      const response = await fetch(`/api/wallet-user/${address}`);
      const data = await response.json();
      
      if (!data.exists) {
        try {
          await fetch('/api/wallet-user/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: address })
          });
        } catch (regError) {
          console.error("Error auto-registering wallet user:", regError);
        }
      }
      
      setBuilderCodeApproved(data.exists && data.builderCodeApproved);
    } catch (error) {
      console.error("Error checking approval status:", error);
      setBuilderCodeApproved(false);
    } finally {
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
      } else {
        setHyperliquidSessionReady(isHyperliquidTradingSessionReady(address));
      }
      return result;
    } finally {
      setIsPreparingHyperliquidSession(false);
    }
  }, [signer, address]);

  // After Equilibrium builder approval: one-time Hyperliquid agent + builder fee (EIP-712), then referral.
  useEffect(() => {
    if (!signer || !address || isCheckingApproval || !builderCodeApproved) return;

    if (isHyperliquidTradingSessionReady(address)) {
      setHyperliquidSessionReady(true);
      trySetReferrer(signer).catch(() => {});
      return;
    }

    let cancelled = false;
    (async () => {
      setIsPreparingHyperliquidSession(true);
      try {
        const result = await ensureHyperliquidTradingSession(signer);
        if (cancelled) return;
        if (result.success) {
          setHyperliquidSessionReady(true);
          await trySetReferrer(signer);
        }
      } finally {
        if (!cancelled) setIsPreparingHyperliquidSession(false);
      }
    })();

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
      setAddress(accounts[0]);
      if (raw) {
        try {
          const browserProvider = new BrowserProvider(raw);
          const browserSigner = await browserProvider.getSigner();
          setProvider(browserProvider);
          setSigner(browserSigner);
        } catch (err) {
          console.error("Error refreshing signer after account change:", err);
        }
      }
    }
  }, []);

  const handleChainChanged = useCallback(async (chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    setChainId(newChainId);
    const raw = activeInjectedRef.current ?? window.ethereum;
    if (raw) {
      try {
        const browserProvider = new BrowserProvider(raw);
        const browserSigner = await browserProvider.getSigner();
        setProvider(browserProvider);
        setSigner(browserSigner);
      } catch (error) {
        console.error("Error reinitializing provider after chain change:", error);
      }
    }
  }, []);

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
        const accounts = await raw.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          activeInjectedRef.current = raw;
          const browserProvider = new BrowserProvider(raw);
          const browserSigner = await browserProvider.getSigner();
          const network = await browserProvider.getNetwork();

          setProvider(browserProvider);
          setSigner(browserSigner);
          setAddress(accounts[0]);
          setChainId(Number(network.chainId));
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
              const requestedAccounts = await raw.request({ method: "eth_requestAccounts" });
              if (requestedAccounts.length > 0) {
                activeInjectedRef.current = raw;
                const browserProvider = new BrowserProvider(raw);
                const browserSigner = await browserProvider.getSigner();
                const network = await browserProvider.getNetwork();

                setProvider(browserProvider);
                setSigner(browserSigner);
                setAddress(requestedAccounts[0]);
                setChainId(Number(network.chainId));
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
  }, [isMobile]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
      if (wasDisconnected) return;
      
      if (document.visibilityState === "visible" && isMobile && !address) {
        const raw =
          resolveInjectedProvider(undefined, eip6963MapRef.current) ?? window.ethereum;
        if (!raw?.request) return;
        try {
          const accounts = await raw.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            activeInjectedRef.current = raw;
            const browserProvider = new BrowserProvider(raw);
            const browserSigner = await browserProvider.getSigner();
            const network = await browserProvider.getNetwork();

            setProvider(browserProvider);
            setSigner(browserSigner);
            setAddress(accounts[0]);
            setChainId(Number(network.chainId));
          }
        } catch (error) {
          console.error("Error reconnecting on visibility change:", error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isMobile, address]);

  const openInWalletBrowser = useCallback((walletType: WalletType) => {
    const path = `${window.location.pathname}${window.location.search}`;
    const hostPath = `${window.location.host}${path}`;

    if (walletType === "metamask") {
      sessionStorage.setItem("metamask_deep_link_pending", "true");
      sessionStorage.removeItem("rabby_deep_link_pending");
      window.location.href = `https://metamask.app.link/dapp/${hostPath}`;
      return;
    }
    if (walletType === "rabby") {
      sessionStorage.setItem("rabby_deep_link_pending", "true");
      sessionStorage.removeItem("metamask_deep_link_pending");
      const fullUrl = `${window.location.origin}${path}`;
      window.location.href = `rabby://dapp?url=${encodeURIComponent(fullUrl)}`;
      return;
    }
    alert("Open this site in your wallet app's browser (DApp / Discover), then use Connect Wallet.");
  }, []);

  const connect = useCallback(async (walletType?: WalletType) => {
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setConnectError(null);

    const selectedProvider = resolveInjectedProvider(walletType, eip6963MapRef.current);

    if (!selectedProvider?.request) {
      if (isMobile) {
        setConnectError(
          "No wallet in this browser. Tap Rabby or MetaMask below to open this site in the app, unlock, then connect."
        );
      } else {
        setConnectError(
          "No wallet detected. Install Rabby or MetaMask (or another EVM wallet), refresh, then try again."
        );
      }
      return;
    }

    setIsConnecting(true);

    try {
      const accounts = await selectedProvider.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned. Please unlock your wallet and try again.");
      }

      activeInjectedRef.current = selectedProvider;

      const browserProvider = new BrowserProvider(selectedProvider);
      const browserSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();
      
      setProvider(browserProvider);
      setSigner(browserSigner);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
    } catch (error: any) {
      console.error("Error connecting wallet:", error);
      let message = "Connection failed. Please try again.";
      if (error.code === 4001) {
        message = "Connection rejected. Please approve the request in your wallet.";
      } else if (error.code === -32002) {
        message = "A connection request is already pending. Please open your wallet and approve it.";
      } else if (error.message) {
        message = error.message;
      }
      setConnectError(message);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [isMobile]);

  const disconnect = useCallback(() => {
    const prev = address;
    localStorage.setItem(WALLET_DISCONNECTED_KEY, 'true');
    activeInjectedRef.current = null;
    if (prev) {
      clearHyperliquidTradingSession(prev);
    }
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setBuilderCodeApproved(false);
    setHyperliquidSessionReady(false);
    setConnectError(null);
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
      connectError,
      connect,
      disconnect,
      switchToArbitrum,
      refreshApprovalStatus,
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
