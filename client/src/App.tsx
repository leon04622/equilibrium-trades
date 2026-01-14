import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TradingProvider } from "@/lib/trading-context";
import { WalletProvider } from "@/lib/wallet-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnect } from "@/components/wallet-connect";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LiveChat } from "@/components/live-chat";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Trading from "@/pages/trading";
import Patterns from "@/pages/patterns";
import Learn from "@/pages/learn";
import Signals from "@/pages/signals";
import Heatmap from "@/pages/heatmap";
import Hyperliquid from "@/pages/hyperliquid";
import Pricing from "@/pages/pricing";
import Settings from "@/pages/settings";
import Portfolio from "@/pages/portfolio";
import { ScrollArea } from "@/components/ui/scroll-area";

function Router() {
  const [location] = useLocation();
  
  return (
    <>
      {/* Keep Trading page always mounted to preserve chart drawings */}
      <div style={{ display: location === "/trading" ? "block" : "none", height: "100%" }}>
        <Trading visible={location === "/trading"} />
      </div>
      
      {/* Other routes unmount normally */}
      {location !== "/trading" && (
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/patterns" component={Patterns} />
          <Route path="/learn" component={Learn} />
          <Route path="/signals" component={Signals} />
          <Route path="/heatmap" component={Heatmap} />
          <Route path="/hyperliquid" component={Hyperliquid} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/settings" component={Settings} />
          <Route path="/portfolio" component={Portfolio} />
          <Route component={NotFound} />
        </Switch>
      )}
    </>
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
        <WalletProvider>
          <TradingProvider>
            <TooltipProvider>
              <SidebarProvider style={style as React.CSSProperties}>
                <div className="flex h-screen w-full overflow-hidden">
                  <AppSidebar />
                  <SidebarInset className="flex flex-col flex-1 min-w-0">
                    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 sticky top-0 z-50 bg-background">
                      <SidebarTrigger data-testid="button-sidebar-toggle" />
                      <div className="flex items-center gap-2">
                        <WalletConnect />
                        <ThemeToggle />
                      </div>
                    </header>
                  <ScrollArea className="flex-1">
                    <main className="min-h-0">
                      <Router />
                    </main>
                  </ScrollArea>
                </SidebarInset>
              </div>
              </SidebarProvider>
              <LiveChat />
              <Toaster />
            </TooltipProvider>
          </TradingProvider>
        </WalletProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
