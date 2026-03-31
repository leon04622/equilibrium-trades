import type { CSSProperties } from "react";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { TradingProvider } from "@/lib/trading-context";
import { WalletProvider } from "@/lib/wallet-context";
import { AuthProvider } from "@/context/AuthContext";
import { UserPersistenceProvider } from "@/context/UserContext";
import { ChatProvider } from "@/lib/chat-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnect } from "@/components/wallet-connect";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { LiveChat } from "@/components/live-chat";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { WalletGate } from "@/components/wallet-gate";
import { EmailCaptureModal } from "@/components/email-capture-modal";
import { BuilderCodeModal } from "@/components/builder-code-modal";
import { TradeHandshakeProvider } from "@/components/trade-handshake-context";
import { PaywallModal } from "@/components/paywall-modal";
import { PaywallProvider } from "@/lib/paywall-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { PoweredByHyperliquid } from "@/components/powered-by-hyperliquid";

import { AdminGuard } from "@/components/admin-guard";
import { LazyJournalView } from "@/components/journal-view.lazy";
import { UserTierSync } from "@/components/user-tier-sync";
import NotFound from "@/pages/not-found";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const Trading = lazy(() => import("@/pages/trading"));
const Patterns = lazy(() => import("@/pages/patterns"));
const Candles = lazy(() => import("@/pages/candles"));
const Learn = lazy(() => import("@/pages/learn"));
const Signals = lazy(() => import("@/pages/signals"));
const Heatmap = lazy(() => import("@/pages/heatmap"));
const EducationalVault = lazy(() => import("@/pages/EducationalVault"));
const Docs = lazy(() => import("@/pages/Docs"));
const DepositGuide = lazy(() => import("@/pages/DepositGuide"));
const Portfolio = lazy(() => import("@/pages/portfolio"));
const Pricing = lazy(() => import("@/pages/pricing"));
const Settings = lazy(() => import("@/pages/settings"));
const TradingAccountPage = lazy(() => import("@/pages/hyperliquid"));
const AdminCommandCenter = lazy(() => import("@/pages/AdminPanel"));

const PAGE_META: Array<{ match: (pathname: string) => boolean; title: string; subtitle: string }> = [
  { match: (pathname) => pathname === "/", title: "Dashboard", subtitle: "Signals, learning, and execution in one calm workspace." },
  {
    match: (pathname) => pathname === "/trade" || pathname.startsWith("/trading"),
    title: "Trading Workspace",
    subtitle: "Move from structure to execution without context switching.",
  },
  { match: (pathname) => pathname.startsWith("/patterns"), title: "Pattern Library", subtitle: "Study the setup language behind cleaner decisions." },
  { match: (pathname) => pathname.startsWith("/candles"), title: "Candlesticks", subtitle: "Learn the candle behaviour behind market intent." },
  { match: (pathname) => pathname.startsWith("/learn"), title: "Courses", subtitle: "Structured lessons tied to the way the platform is actually used." },
  { match: (pathname) => pathname.startsWith("/videos"), title: "Educational Vault", subtitle: "Premium lessons and walkthroughs for subscribed members." },
  { match: (pathname) => pathname.startsWith("/signals"), title: "AI Signals", subtitle: "Review live pattern opportunities with more context." },
  { match: (pathname) => pathname.startsWith("/heatmap"), title: "Heatmap", subtitle: "Track liquidity and hidden pressure across the book." },
  { match: (pathname) => pathname.startsWith("/journal"), title: "Journal", subtitle: "Review decisions and reinforce disciplined execution." },
  { match: (pathname) => pathname.startsWith("/portfolio"), title: "Portfolio", subtitle: "Keep balances, exposure, and performance in view." },
  { match: (pathname) => pathname.startsWith("/pricing"), title: "Membership", subtitle: "Choose the level of access and guidance that fits you." },
  { match: (pathname) => pathname.startsWith("/settings"), title: "Settings", subtitle: "Fine-tune the workspace around your routine." },
  {
    match: (pathname) => pathname.startsWith("/trading-account") || pathname.startsWith("/hyperliquid"),
    title: "Trading Account",
    subtitle: "Connect your wallet and manage how the platform reaches your exchange account.",
  },
  {
    match: (pathname) => pathname.startsWith("/guide/deposit"),
    title: "Deposit guide",
    subtitle: "Fund your account with USDC on Arbitrum using the same EVM wallets Hyperliquid users rely on.",
  },
  { match: (pathname) => pathname.startsWith("/docs"), title: "Docs", subtitle: "Reference workflows, implementation notes, and platform details." },
  { match: (pathname) => pathname.startsWith("/admin"), title: "Command Center", subtitle: "Manage members, vault content, and support operations." },
];

function getPageMeta(pathname: string) {
  return PAGE_META.find((item) => item.match(pathname)) ?? {
    title: "Equilibrium",
    subtitle: "Trading, education, and review in one connected workspace.",
  };
}

function RouteChunkFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
      <p className="text-sm font-medium text-foreground/80">{label}</p>
    </div>
  );
}

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
            <AuthProvider>
            <UserPersistenceProvider>
            <UserTierSync />
            <TradingProvider>
              <TradeHandshakeProvider>
                <ChatProvider>
                  <TooltipProvider delayDuration={200}>
                      <WalletGate>
                      <EmailCaptureModal />
                      <BuilderCodeModal />
                      <PaywallProvider>
                        <PaywallModal />
                        <SidebarProvider style={style}>
                          <a
                            href="#main-content"
                            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            Skip to main content
                          </a>
                          <div className="flex w-full overflow-hidden" style={{ height: "100dvh" }}>
                            <AppSidebar />
                            <SidebarInset className="flex flex-col flex-1 min-w-0 overflow-hidden">
                              <ShellHeader />
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
            </UserPersistenceProvider>
            </AuthProvider>
          </WalletProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ShellHeader() {
  const { pathname } = useLocation();
  const meta = getPageMeta(pathname);

  useEffect(() => {
    const m = getPageMeta(pathname);
    document.title = m.title === "Equilibrium" ? "Equilibrium" : `${m.title} · Equilibrium`;
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/92 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-4">
      <div className="flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger
            className="rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-sm"
            data-testid="button-sidebar-toggle"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:inline">
                Equilibrium
              </span>
              <span className="hidden h-1 w-1 rounded-full bg-primary/60 sm:inline-block" />
              <span className="truncate text-base font-semibold text-foreground md:text-lg">{meta.title}</span>
            </div>
            <p className="hidden truncate text-sm text-muted-foreground md:block">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Professional workflow
          </div>
          <PoweredByHyperliquid compact className="inline-flex md:hidden" />
          <PoweredByHyperliquid className="hidden md:inline-flex" />
          <WalletConnect />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function TradingLayout() {
  const { pathname } = useLocation();
  const isTrading = pathname === "/trading" || pathname === "/trade";

  return (
    <>
      {isTrading ? (
        <div
          id="main-content"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none"
        >
          <Suspense fallback={<RouteChunkFallback label="Loading trading workspace…" />}>
            <Trading />
          </Suspense>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <main id="main-content" tabIndex={-1} className="min-h-0 pb-16 md:pb-0 outline-none">
            <Suspense fallback={<RouteChunkFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/patterns" element={<Patterns />} />
                <Route path="/candles" element={<Candles />} />
                <Route path="/learn" element={<Learn />} />
                <Route path="/signals" element={<Signals />} />
                <Route path="/heatmap" element={<Heatmap />} />
                <Route path="/videos" element={<EducationalVault />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/guide/deposit" element={<DepositGuide />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/journal" element={<LazyJournalView />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/subscribe" element={<Pricing />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/trading-account" element={<TradingAccountPage />} />
                <Route path="/hyperliquid" element={<Navigate to="/trading-account" replace />} />
                <Route
                  path="/admin"
                  element={
                    <AdminGuard>
                      <AdminCommandCenter />
                    </AdminGuard>
                  }
                />
                <Route path="/admin-equilibrium" element={<Navigate to="/admin" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </ScrollArea>
      )}
    </>
  );
}

export default App;
