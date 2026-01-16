import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

interface WalletContextType {
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  builderCodeApproved: boolean;
  isCheckingApproval: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToArbitrum: () => Promise<void>;
  refreshApprovalStatus: () => Promise<void>;
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
    };
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [builderCodeApproved, setBuilderCodeApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);

  const isConnected = !!address && !!signer;

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

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }

    setIsConnecting(true);
    
    try {
      const accounts = await window.ethereum.request({ 
        method: "eth_requestAccounts" 
      });
      
      const browserProvider = new BrowserProvider(window.ethereum);
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
  }, []);

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
      connect,
      disconnect,
      switchToArbitrum,
      refreshApprovalStatus,
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
