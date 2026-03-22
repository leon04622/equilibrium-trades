import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

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

const WALLET_DISCONNECTED_KEY = 'wallet_user_disconnected';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [builderCodeApproved, setBuilderCodeApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [detectedWallets, setDetectedWallets] = useState<DetectedWallet[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const isConnected = !!address && !!signer;

  // Detect wallets on mount, then again after 800ms to catch late injectors
  useEffect(() => {
    setIsMobile(detectMobile());
    setDetectedWallets(detectWallets());

    const retryTimer = setTimeout(() => {
      setDetectedWallets(detectWallets());
    }, 800);

    // Also listen for EIP-6963 provider announcements (modern standard)
    const handleProviderAnnouncement = () => {
      setDetectedWallets(detectWallets());
    };
    window.addEventListener("eip6963:announceProvider", handleProviderAnnouncement);

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener("eip6963:announceProvider", handleProviderAnnouncement);
    };
  }, []);

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

  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
    if (accounts.length === 0) {
      setAddress(null);
      setSigner(null);
      setProvider(null);
    } else {
      setAddress(accounts[0]);
      if (window.ethereum) {
        try {
          const browserProvider = new BrowserProvider(window.ethereum);
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
    
    if (window.ethereum) {
      try {
        const browserProvider = new BrowserProvider(window.ethereum);
        const browserSigner = await browserProvider.getSigner();
        setProvider(browserProvider);
        setSigner(browserSigner);
      } catch (error) {
        console.error("Error reinitializing provider after chain change:", error);
      }
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [handleAccountsChanged, handleChainChanged]);

  useEffect(() => {
    const checkConnection = async () => {
      const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
      if (wasDisconnected) return;
      
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            const browserProvider = new BrowserProvider(window.ethereum);
            const browserSigner = await browserProvider.getSigner();
            const network = await browserProvider.getNetwork();
            
            setProvider(browserProvider);
            setSigner(browserSigner);
            setAddress(accounts[0]);
            setChainId(Number(network.chainId));
          } else if (isMobile && window.ethereum.isMetaMask) {
            const pendingDeepLink = sessionStorage.getItem('metamask_deep_link_pending');
            if (pendingDeepLink) {
              sessionStorage.removeItem('metamask_deep_link_pending');
              try {
                setIsConnecting(true);
                const requestedAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });
                if (requestedAccounts.length > 0) {
                  const browserProvider = new BrowserProvider(window.ethereum);
                  const browserSigner = await browserProvider.getSigner();
                  const network = await browserProvider.getNetwork();
                  
                  setProvider(browserProvider);
                  setSigner(browserSigner);
                  setAddress(requestedAccounts[0]);
                  setChainId(Number(network.chainId));
                }
              } catch (err) {
                console.error("Error auto-connecting in MetaMask browser:", err);
              } finally {
                setIsConnecting(false);
              }
            }
          }
        } catch (error) {
          console.error("Error checking wallet connection:", error);
        }
      }
    };

    checkConnection();
  }, [isMobile]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      const wasDisconnected = localStorage.getItem(WALLET_DISCONNECTED_KEY) === 'true';
      if (wasDisconnected) return;
      
      if (document.visibilityState === 'visible' && isMobile && window.ethereum && !address) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            const browserProvider = new BrowserProvider(window.ethereum);
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
    if (walletType === "metamask") {
      sessionStorage.setItem('metamask_deep_link_pending', 'true');
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
    } else {
      alert("Please open this site inside your wallet's built-in browser to connect on mobile.");
    }
  }, []);

  const connect = useCallback(async (walletType?: WalletType) => {
    localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setConnectError(null);

    if (!window.ethereum) {
      if (isMobile) {
        openInWalletBrowser("metamask");
      } else {
        setConnectError("No wallet detected. Please install MetaMask, Rabby, or another EVM wallet extension.");
      }
      return;
    }

    setIsConnecting(true);
    
    try {
      // Find the right provider for the chosen wallet type
      let selectedProvider: any = window.ethereum;
      
      if (walletType && walletType !== "injected") {
        // Check standalone objects first
        if (walletType === "okx" && window.okxwallet) {
          selectedProvider = window.okxwallet;
        } else if (walletType === "phantom" && window.phantom?.ethereum) {
          selectedProvider = window.phantom.ethereum;
        } else if (window.ethereum.providers?.length) {
          // Search multi-provider array
          for (const p of window.ethereum.providers) {
            const info = getWalletInfo(p);
            if (info?.type === walletType) {
              selectedProvider = p;
              break;
            }
          }
        } else {
          // Single provider — verify it matches
          const info = getWalletInfo(window.ethereum);
          if (info?.type === walletType) {
            selectedProvider = window.ethereum;
          }
        }
      }
      
      const accounts = await selectedProvider.request({ 
        method: "eth_requestAccounts" 
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned. Please unlock your wallet and try again.");
      }
      
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
  }, [isMobile, openInWalletBrowser]);

  const disconnect = useCallback(() => {
    localStorage.setItem(WALLET_DISCONNECTED_KEY, 'true');
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setBuilderCodeApproved(false);
    setConnectError(null);
  }, []);

  const switchToArbitrum = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${ARBITRUM_CHAIN_ID.toString(16)}` }],
      });
    } catch (error: any) {
      if (error.code === 4902) {
        await window.ethereum.request({
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
