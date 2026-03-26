import type { CSSProperties } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TradingProvider } from "@/lib/trading-context";
import { WalletProvider } from "@/lib/wallet-context";
import { ChatProvider } from "@/lib/chat-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnect } from "@/components/wallet-connect";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LiveChat } from "@/components/live-chat";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { WalletGate } from "@/components/wallet-gate";
import { BuilderCodeModal } from "@/components/builder-code-modal";
import { TradeHandshakeProvider } from "@/components/trade-handshake-context";
import { PaywallModal } from "@/components/paywall-modal";
import { PaywallProvider } from "@/lib/paywall-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppErrorBoundary } from "@/components/app-error-boundary";

import Dashboard from "@/pages/dashboard";
import Trading from "@/pages/trading";
import Signals from "@/pages/signals";
import Videos from "@/pages/videos";
import AdminDashboard from "@/pages/AdminDashboard";

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as CSSProperties;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppErrorBoundary>
          <WalletProvider>
            <TradingProvider>
              <TradeHandshakeProvider>
                <ChatProvider>
                  <TooltipProvider delayDuration={200}>
                    <WalletGate>
                      <BuilderCodeModal />
                      <PaywallProvider>
                        <PaywallModal />
                        <SidebarProvider style={style}>
                          <div className="flex w-full overflow-hidden" style={{ height: "100dvh" }}>
                            <AppSidebar />
                            <SidebarInset className="flex flex-col flex-1 min-w-0 overflow-hidden">
                              <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 md:px-4 sticky top-0 z-50 bg-background">
                                <div className="flex items-center gap-2">
                                  <SidebarTrigger
                                    className="border border-primary/30 bg-primary/10 text-primary"
                                    data-testid="button-sidebar-toggle"
                                  />
                                  <span className="text-xs font-medium text-muted-foreground hidden sm:block">Menu</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <WalletConnect />
                                  <ThemeToggle />
                                </div>
                              </header>
                              <TradingLayout />
                            </SidebarInset>
                          </div>
                          <MobileBottomNav />
                          <LiveChat />
                        </SidebarProvider>
                        <Toaster />
                      </PaywallProvider>
                    </WalletGate>
                  </TooltipProvider>
                </ChatProvider>
              </TradeHandshakeProvider>
            </TradingProvider>
          </WalletProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function TradingLayout() {
  const { pathname } = useLocation();
  const isTrading = pathname === "/trading" || pathname === "/trade";

  return (
    <>
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ display: isTrading ? "flex" : "none", flexDirection: "column" }}
      >
        <Trading visible={isTrading} />
      </div>
      {!isTrading && (
        <ScrollArea className="flex-1">
          <main className="min-h-0 pb-16 md:pb-0">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/signals" element={<Signals />} />
              <Route path="/videos" element={<Videos />} />
              <Route path="/admin-equilibrium" element={<AdminDashboard />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </ScrollArea>
      )}
    </>
  );
}

export default App;
