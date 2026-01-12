import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
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
import { ScrollArea } from "@/components/ui/scroll-area";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/trading" component={Trading} />
      <Route path="/patterns" component={Patterns} />
      <Route path="/learn" component={Learn} />
      <Route path="/signals" component={Signals} />
      <Route path="/heatmap" component={Heatmap} />
      <Route path="/hyperliquid" component={Hyperliquid} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/settings" component={Settings} />
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
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full overflow-hidden">
              <AppSidebar />
              <SidebarInset className="flex flex-col flex-1 min-w-0">
                <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 sticky top-0 z-50 bg-background">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <ScrollArea className="flex-1">
                  <main className="min-h-0">
                    <Router />
                  </main>
                </ScrollArea>
              </SidebarInset>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
