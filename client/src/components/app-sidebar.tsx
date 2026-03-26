import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  LineChart,
  TrendingUp,
  ShieldCheck,
  Activity,
  PlayCircle,
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
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useChat } from "@/lib/chat-context";
import { useQuery } from "@tanstack/react-query";

const platformNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Trading", url: "/trading", icon: LineChart },
  {
    title: "AI Pattern Scanner",
    url: "/signals",
    icon: Activity,
    badge: "Pro",
    badgeVariant: "secondary" as const,
  },
  {
    title: "Educational Vault",
    url: "/videos",
    icon: PlayCircle,
    badge: "Pro",
    badgeVariant: "outline" as const,
  },
];

function pathMatches(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { address } = useWallet();
  const { isMasterAdmin } = useIsMasterAdmin();
  const { openChat } = useChat();

  const { data: supportConversations = [] } = useQuery<
    { conversationId: string; lastMessage: { message: string }; unreadCount: number }[]
  >({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      if (!address) return [];
      const res = await fetch("/api/support/conversations", {
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isMasterAdmin && !!address,
    refetchInterval: 30_000,
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
          <span className="font-semibold text-sm text-foreground">Equilibrium</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformNavItems.map((item) => (
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
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => openChat()}
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

        {isMasterAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathMatches(pathname, "/admin-equilibrium")}
                      data-testid="nav-admin"
                    >
                      <Link to="/admin-equilibrium">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Command Center</span>
                        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                          Master
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

      <SidebarFooter className="p-2 text-[10px] text-muted-foreground text-center border-t">
        Hyperliquid charting · Pattern scanner
      </SidebarFooter>
    </Sidebar>
  );
}
