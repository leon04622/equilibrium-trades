import { Link, useLocation } from "wouter";
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
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/wallet-context";
import { isAdminWallet } from "@shared/schema";

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Trading",
    url: "/trading",
    icon: LineChart,
    badge: "Live",
    badgeVariant: "default" as const,
  },
  {
    title: "Pattern Library",
    url: "/patterns",
    icon: BookOpen,
  },
  {
    title: "Candlesticks",
    url: "/candles",
    icon: CandlestickChart,
  },
  {
    title: "Learn",
    url: "/learn",
    icon: GraduationCap,
  },
  {
    title: "Videos",
    url: "/videos",
    icon: Play,
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
  {
    title: "Portfolio",
    url: "/portfolio",
    icon: Wallet,
  },
  {
    title: "Connect Exchange",
    url: "/hyperliquid",
    icon: TrendingUp,
  },
  {
    title: "Subscription",
    url: "/pricing",
    icon: CreditCard,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { address } = useWallet();
  const isAdmin = address ? isAdminWallet(address) : false;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg tracking-tight">
              Equilibrium
            </span>
            <span className="text-xs text-muted-foreground">
              Trading Platform
            </span>
          </div>
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
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge 
                          variant={item.badgeVariant} 
                          className="ml-auto text-[10px] px-1.5 py-0"
                        >
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
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.badge && (
                        <Badge 
                          variant={item.badgeVariant}
                          className="ml-auto text-[10px] px-1.5 py-0"
                        >
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
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/admin"}
                      data-testid="nav-admin"
                    >
                      <Link href="/admin">
                        <Shield className="h-4 w-4" />
                        <span>Admin Panel</span>
                        <Badge 
                          variant="destructive"
                          className="ml-auto text-[10px] px-1.5 py-0"
                        >
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

      <SidebarFooter className="p-4">
        <div className="rounded-md bg-primary/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-medium text-foreground">Market Open</span>
          </div>
          <p className="text-xs text-muted-foreground">
            24/7 crypto markets are live
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
