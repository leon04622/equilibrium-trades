import { Link, useLocation } from "react-router-dom";
import { TrendingUp, Home, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/trading", icon: TrendingUp, label: "Trade" },
  { to: "/admin-equilibrium", icon: Shield, label: "Admin" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-around h-14">
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
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span className={cn("text-[10px] font-medium", isActive && "text-primary")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
