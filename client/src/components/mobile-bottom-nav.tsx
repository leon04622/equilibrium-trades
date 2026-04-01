import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, User, GraduationCap, Home, Shield, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useWallet } from "@/lib/wallet-context";

const baseItems = [
  { to: "/", guestTo: "/trading", icon: Home, label: "Home" },
  { to: "/trading", icon: TrendingUp, label: "Trade" },
  { to: "/learn", icon: GraduationCap, label: "Learn" },
  { to: "/journal", icon: NotebookPen, label: "Journal" },
  { to: "/portfolio", icon: BarChart3, label: "Portfolio" },
  { to: "/settings", icon: User, label: "Account" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isMasterAdmin } = useIsMasterAdmin();
  const { isAdmin: isAppAdmin } = useIsAdmin();
  const { isConnected } = useWallet();

  const navItems = isMasterAdmin || isAppAdmin
    ? [...baseItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : baseItems;

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-1"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-[3.75rem] min-h-[3rem] max-w-lg items-center justify-around rounded-2xl border border-border/70 bg-background/90 px-1.5 shadow-2xl shadow-black/10 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {navItems.map((item) => {
          const target = isConnected ? item.to : ("guestTo" in item && item.guestTo ? item.guestTo : item.to);
          const isActive =
            target === "/"
              ? pathname === "/"
              : pathname === target || pathname.startsWith(`${target}/`);

          return (
            <Link
              key={item.to}
              to={target}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive && "text-primary")} />
              <span className={cn("max-w-full truncate text-[10px] font-medium", isActive && "text-primary")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
