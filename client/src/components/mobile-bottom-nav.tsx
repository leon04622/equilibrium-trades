import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, User, GraduationCap, Home, Shield, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useIsAdmin } from "@/hooks/use-is-admin";

const baseItems = [
  { to: "/", icon: Home, label: "Home" },
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

  const navItems = isMasterAdmin || isAppAdmin
    ? [...baseItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : baseItems;

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-3 z-50 px-3">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around rounded-2xl border border-border/70 bg-background/90 px-1.5 shadow-2xl shadow-black/10 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? pathname === "/"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all",
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
