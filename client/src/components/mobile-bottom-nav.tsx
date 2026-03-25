import { Link, useLocation } from "wouter";
import { BarChart3, TrendingUp, User, BookOpen, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/trading", icon: TrendingUp, label: "Trade" },
  { href: "/patterns", icon: BookOpen, label: "Learn" },
  { href: "/portfolio", icon: BarChart3, label: "Portfolio" },
  { href: "/settings", icon: User, label: "Account" },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const path = typeof location === "string" ? location : "";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = path === item.href || 
            (item.href === "/trading" && path.startsWith("/trading"));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span className={cn(
                "text-[10px] font-medium",
                isActive && "text-primary"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
