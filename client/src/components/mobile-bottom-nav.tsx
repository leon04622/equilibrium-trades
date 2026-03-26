import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, User, GraduationCap, Home, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";

const baseItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/trading", icon: TrendingUp, label: "Trade" },
  { to: "/learn", icon: GraduationCap, label: "Learn" },
  { to: "/portfolio", icon: BarChart3, label: "Portfolio" },
  { to: "/settings", icon: User, label: "Account" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isMasterAdmin } = useIsMasterAdmin();

  const navItems = isMasterAdmin
    ? [...baseItems, { to: "/admin", icon: Shield, label: "Admin" }]
    : baseItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-around h-14 px-0.5">
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
                "flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 min-w-0 flex-1",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
              <span className={cn("text-[9px] font-medium truncate max-w-full", isActive && "text-primary")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
