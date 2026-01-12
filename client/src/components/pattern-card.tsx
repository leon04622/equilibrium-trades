import { 
  TrendingUp, TrendingDown, Triangle, Flag, Coffee, Activity, 
  ArrowBigDown, ArrowBigUp, ChevronsDown, ChevronsUp, Diamond,
  ArrowUpRight, ArrowDownRight, Circle, ArrowUpCircle, ArrowDownCircle,
  Sunrise, Sunset, Minimize2, type LucideIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PatternDefinition } from "@shared/schema";

const iconMap: Record<string, LucideIcon> = {
  TrendingUp,
  TrendingDown,
  Triangle,
  Flag,
  Coffee,
  Activity,
  ArrowBigDown,
  ArrowBigUp,
  ChevronsDown,
  ChevronsUp,
  Diamond,
  ArrowUpRight,
  ArrowDownRight,
  Circle,
  ArrowUpCircle,
  ArrowDownCircle,
  Sunrise,
  Sunset,
  Minimize2,
};

interface PatternCardProps {
  pattern: PatternDefinition;
  onLearnMore?: () => void;
  compact?: boolean;
}

export function PatternCard({ pattern, onLearnMore, compact = false }: PatternCardProps) {
  const Icon = iconMap[pattern.iconName] || TrendingUp;
  
  const directionColors = {
    bullish: "text-bullish",
    bearish: "text-bearish",
    neutral: "text-warning",
  };

  const difficultyColors = {
    beginner: "bg-success/15 text-success border-success/20",
    intermediate: "bg-warning/15 text-warning border-warning/20",
    advanced: "bg-destructive/15 text-destructive border-destructive/20",
  };

  if (compact) {
    return (
      <Card 
        className="hover-elevate cursor-pointer transition-all"
        onClick={onLearnMore}
        data-testid={`pattern-card-${pattern.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
              pattern.direction === "bullish" ? "bg-bullish/15" : 
              pattern.direction === "bearish" ? "bg-bearish/15" : "bg-warning/15"
            )}>
              <Icon className={cn("h-5 w-5", directionColors[pattern.direction])} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">{pattern.name}</h3>
              <p className="text-xs text-muted-foreground capitalize">{pattern.type}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-mono font-semibold">{pattern.successRate}%</span>
              <p className="text-[10px] text-muted-foreground">Success</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="hover-elevate overflow-hidden"
      data-testid={`pattern-card-${pattern.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg",
              pattern.direction === "bullish" ? "bg-bullish/15" : 
              pattern.direction === "bearish" ? "bg-bearish/15" : "bg-warning/15"
            )}>
              <Icon className={cn("h-6 w-6", directionColors[pattern.direction])} />
            </div>
            <div>
              <CardTitle className="text-base">{pattern.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px] capitalize", difficultyColors[pattern.difficulty])}
                >
                  {pattern.difficulty}
                </Badge>
                <span className="text-xs text-muted-foreground capitalize">
                  {pattern.type}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className={cn(
              "text-xl font-mono font-bold",
              pattern.successRate >= 70 ? "text-bullish" : 
              pattern.successRate >= 60 ? "text-warning" : "text-foreground"
            )}>
              {pattern.successRate}%
            </span>
            <p className="text-[10px] text-muted-foreground">Success Rate</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {pattern.description}
        </p>
        <Button 
          variant="secondary" 
          size="sm" 
          className="w-full"
          onClick={onLearnMore}
          data-testid={`button-learn-${pattern.id}`}
        >
          Learn This Pattern
        </Button>
      </CardContent>
    </Card>
  );
}
