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
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
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
import { useQuery } from "@tanstack/react-query";

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
  { title: "Portfolio", url: "/portfolio", icon: Wallet },
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm text-foreground">Trading Platform</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
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
    </Sidebar>
  );
}
