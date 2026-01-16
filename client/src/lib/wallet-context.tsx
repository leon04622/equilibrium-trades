import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

export type WalletType = "metamask" | "rabby" | "injected" | "none";

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
      providers?: any[];
    };
  }
}

function detectMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function detectWallets(): DetectedWallet[] {
  const wallets: DetectedWallet[] = [];
  
  if (!window.ethereum) {
    return wallets;
  }

  // Check for multiple providers (MetaMask + Rabby etc.)
  if (window.ethereum.providers?.length) {
    for (const provider of window.ethereum.providers) {
      if (provider.isRabby) {
        wallets.push({ type: "rabby", name: "Rabby Wallet", provider });
      } else if (provider.isMetaMask) {
        wallets.push({ type: "metamask", name: "MetaMask", provider });
      }
    }
  } else {
    // Single provider
    if (window.ethereum.isRabby) {
      wallets.push({ type: "rabby", name: "Rabby Wallet", provider: window.ethereum });
    } else if (window.ethereum.isMetaMask) {
      wallets.push({ type: "metamask", name: "MetaMask", provider: window.ethereum });
    } else {
      wallets.push({ type: "injected", name: "Browser Wallet", provider: window.ethereum });
    }
  }

  return wallets;
}

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

  const isConnected = !!address && !!signer;

  // Detect wallets and mobile on mount
  useEffect(() => {
    setIsMobile(detectMobile());
    setDetectedWallets(detectWallets());
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

  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (accounts.length === 0) {
      setAddress(null);
      setSigner(null);
      setProvider(null);
    } else {
      setAddress(accounts[0]);
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
          }
        } catch (error) {
          console.error("Error checking wallet connection:", error);
        }
      }
    };

    checkConnection();
  }, []);

  const openInWalletBrowser = useCallback((walletType: WalletType) => {
    const currentUrl = encodeURIComponent(window.location.href);
    
    if (walletType === "metamask") {
      // MetaMask deep link format
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
    } else if (walletType === "rabby") {
      // Rabby doesn't have mobile app yet, show message
      alert("Rabby Wallet is currently desktop-only. Please use MetaMask mobile or open this site in your Rabby browser extension on desktop.");
    }
  }, []);

  const connect = useCallback(async (walletType?: WalletType) => {
    // On mobile without any wallet provider, show deep link options
    if (!window.ethereum) {
      if (isMobile) {
        openInWalletBrowser("metamask");
      } else {
        window.open("https://metamask.io/download/", "_blank");
      }
      return;
    }

    setIsConnecting(true);
    
    try {
      // Find the correct provider based on wallet type
      let selectedProvider = window.ethereum;
      
      if (walletType && window.ethereum.providers?.length) {
        for (const p of window.ethereum.providers) {
          if (walletType === "rabby" && p.isRabby) {
            selectedProvider = p;
            break;
          } else if (walletType === "metamask" && p.isMetaMask && !p.isRabby) {
            selectedProvider = p;
            break;
          }
        }
      }
      
      const accounts = await selectedProvider.request({ 
        method: "eth_requestAccounts" 
      });
      
      const browserProvider = new BrowserProvider(selectedProvider);
      const browserSigner = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();
      
      setProvider(browserProvider);
      setSigner(browserSigner);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
    } catch (error: any) {
      console.error("Error connecting wallet:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [isMobile, openInWalletBrowser]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setBuilderCodeApproved(false);
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
            nativeCurrency: {
              name: "Ethereum",
              symbol: "ETH",
              decimals: 18,
            },
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
