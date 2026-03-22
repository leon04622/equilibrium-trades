import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PaywallContextType {
  isOpen: boolean;
  triggerFeature: string | null;
  openPaywall: (featureName?: string) => void;
  closePaywall: () => void;
}

const PaywallContext = createContext<PaywallContextType | undefined>(undefined);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [triggerFeature, setTriggerFeature] = useState<string | null>(null);

  const openPaywall = useCallback((featureName?: string) => {
    setTriggerFeature(featureName || null);
    setIsOpen(true);
  }, []);

  const closePaywall = useCallback(() => {
    setIsOpen(false);
    setTriggerFeature(null);
  }, []);

  return (
    <PaywallContext.Provider value={{ isOpen, triggerFeature, openPaywall, closePaywall }}>
      {children}
    </PaywallContext.Provider>
  );
}

export function usePaywall() {
  const context = useContext(PaywallContext);
  if (!context) {
    throw new Error("usePaywall must be used within a PaywallProvider");
  }
  return context;
}
