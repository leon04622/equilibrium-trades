import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  BookOpen,
  GraduationCap,
  Settings,
  Zap,
  CreditCard,
  TrendingUp,
  Flame,
  Wallet,
  Play,
  CandlestickChart,
  Shield,
  MessageCircle,
  NotebookPen,
  BookMarked,
  Banknote,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useChat } from "@/lib/chat-context";
import { useSubscription } from "@/hooks/use-subscription";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  {
    title: "Trading",
    url: "/trading",
    icon: LineChart,
    badge: "Live",
    badgeVariant: "default" as const,
  },
  { title: "Pattern Library", url: "/patterns", icon: BookOpen },
  { title: "Candlesticks", url: "/candles", icon: CandlestickChart },
];

const learnNavItems = [
  {
    title: "Courses",
    url: "/learn",
    icon: GraduationCap,
  },
  {
    title: "Videos",
    url: "/videos",
    icon: Play,
    badge: "Pro",
    badgeVariant: "outline" as const,
  },
];

const toolsNavItems = [
  {
    title: "AI Signals",
    url: "/signals",
    icon: Zap,
    badge: "AI",
    badgeVariant: "secondary" as const,
  },
  {
    title: "Heatmap",
    url: "/heatmap",
    icon: Flame,
    badge: "Pro",
    badgeVariant: "outline" as const,
  },
];

const accountNavItems = [
  { title: "Journal", url: "/journal", icon: NotebookPen },
  { title: "Portfolio", url: "/portfolio", icon: Wallet },
  { title: "Deposit guide", url: "/guide/deposit", icon: Banknote },
  { title: "Docs", url: "/docs", icon: BookMarked },
  { title: "Subscription", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
];

function pathMatches(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { address } = useWallet();
  const { tier, isSubscribed } = useSubscription();
  const { isMasterAdmin } = useIsMasterAdmin();
  const { isAdmin: isAppAdmin } = useIsAdmin();
  const showAdminNav = isMasterAdmin || isAppAdmin;
  const { openChat, openSupportInbox } = useChat();

  const { data: supportConversations = [] } = useQuery<
    { conversationId: string; lastMessage: { message: string }; unreadCount: number }[]
  >({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch("/api/support/conversations", {
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) {
        let detail = res.statusText || "Request failed";
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = (await res.json()) as { error?: string };
            if (typeof j?.error === "string") detail = j.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(`Support inbox (${res.status}): ${detail}`);
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("Support inbox: expected JSON array from API");
      }
      return data;
    },
    enabled: isMasterAdmin && !!address,
    refetchInterval: 30_000,
    retry: 1,
  });

  const supportUnread = isMasterAdmin
    ? supportConversations.reduce((sum, c) => sum + c.unreadCount, 0)
    : 0;

  const tierLabel =
    tier === "mentoring"
      ? "Mentoring"
      : tier === "pro"
        ? "Pro"
        : "Standard";

  return (
    <Sidebar className="bg-sidebar/95 backdrop-blur">
      <SidebarHeader className="p-4 pb-3">
        <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/30 p-3 shadow-sm">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">Equilibrium</p>
              <p className="truncate text-[11px] text-muted-foreground">Trading workspace</p>
            </div>
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-sidebar-border/60 bg-background/70 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Membership</p>
              <p className="truncate text-xs font-medium text-foreground">{tierLabel}</p>
            </div>
            <Badge
              variant={isSubscribed ? "default" : "outline"}
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px]"
            >
              {isSubscribed ? "Active" : "Explore"}
            </Badge>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent id="app-sidebar-nav">
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathMatches(pathname, item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge variant={item.badgeVariant} className="ml-auto text-[10px] px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Learn</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {learnNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathMatches(pathname, item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge variant={item.badgeVariant} className="ml-auto text-[10px] px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathMatches(pathname, item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge variant={item.badgeVariant} className="ml-auto text-[10px] px-1.5 py-0">
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathMatches(pathname, item.url)}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => (isMasterAdmin ? openSupportInbox() : openChat())}
                  tooltip="Chat Support"
                  data-testid="nav-chat-support"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Chat Support</span>
                  {supportUnread > 0 && (
                    <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                      {supportUnread}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdminNav && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathMatches(pathname, "/admin")}
                      data-testid="nav-admin"
                    >
                      <Link to="/admin">
                        <Shield className="h-4 w-4" />
                        <span>Admin Panel</span>
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                          Admin
                        </Badge>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 pt-2">
        <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/25 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Need help fast?</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Open support without leaving your workflow.
              </p>
            </div>
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.45)]" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full justify-between bg-background/80"
            onClick={() => (isMasterAdmin ? openSupportInbox() : openChat())}
          >
            <span>{isMasterAdmin ? "Open support inbox" : "Message support"}</span>
            <MessageCircle className="h-4 w-4" />
          </Button>
          {address && (
            <p className="mt-3 truncate text-[11px] text-muted-foreground">
              Signed in: {address}
            </p>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
