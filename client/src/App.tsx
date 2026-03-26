import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Trading from "@/pages/trading";
import Patterns from "@/pages/patterns";
import Learn from "@/pages/learn";
import Signals from "@/pages/signals";
import Heatmap from "@/pages/heatmap";
import Pricing from "@/pages/pricing";
import Settings from "@/pages/settings";
import Portfolio from "@/pages/portfolio";
import Videos from "@/pages/videos";
import Candles from "@/pages/candles";
import Admin from "@/pages/admin";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppErrorBoundary } from "@/components/app-error-boundary";

function AdminEquilibriumRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/admin");
  }, [setLocation]);
  return (
    <div className="p-6 text-sm text-muted-foreground">Opening Equilibrium Command Center…</div>
  );
}

function OtherRoutes() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/patterns" component={Patterns} />
      <Route path="/candles" component={Candles} />
      <Route path="/learn" component={Learn} />
      <Route path="/signals" component={Signals} />
      <Route path="/heatmap" component={Heatmap} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/settings" component={Settings} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/videos" component={Videos} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin-equilibrium" component={AdminEquilibriumRedirect} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

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
              <SidebarProvider style={style as React.CSSProperties}>
                <div className="flex w-full overflow-hidden" style={{ height: '100dvh' }}>
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

                    {/* Trading page: always-mounted, gets its own flex-1 container so h-full works on mobile */}
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
  const [location] = useLocation();
  // Match /trading and /trading?coin=XYZ (wouter includes query string in location)
  const path = typeof location === "string" ? location : "";
  const isTrading = path === "/trading" || path.startsWith("/trading?");

  return (
    <>
      {/* Trading page: fixed-height container using dvh for correct mobile viewport height */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ display: isTrading ? "flex" : "none", flexDirection: "column" }}
      >
        <Trading visible={isTrading} />
      </div>

      {/* All other pages: scrollable */}
      {!isTrading && (
        <ScrollArea className="flex-1">
          <main className="min-h-0 pb-16 md:pb-0">
            <OtherRoutes />
          </main>
        </ScrollArea>
      )}
    </>
  );
}

export default App;
