import { 
  TrendingUp, TrendingDown, Triangle, Flag, Coffee, Activity, 
  ArrowBigDown, ArrowBigUp, ChevronsDown, ChevronsUp, Diamond,
  ArrowUpRight, ArrowDownRight, Circle, ArrowUpCircle, ArrowDownCircle,
  Sunrise, Sunset, Minimize2, Clock, Target, ShieldAlert,
  type LucideIcon
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LivePattern } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const iconMap: Record<string, LucideIcon> = {
  TrendingUp, TrendingDown, Triangle, Flag, Coffee, Activity,
  ArrowBigDown, ArrowBigUp, ChevronsDown, ChevronsUp, Diamond,
  ArrowUpRight, ArrowDownRight, Circle, ArrowUpCircle, ArrowDownCircle,
  Sunrise, Sunset, Minimize2,
};

interface LivePatternCardProps {
  livePattern: LivePattern;
  onLearnMore?: () => void;
}

export function LivePatternCard({ livePattern, onLearnMore }: LivePatternCardProps) {
  const { pattern, confidence, status, symbol, timeframe, entryPrice, stopLoss, takeProfit, detectedAt } = livePattern;
  const Icon = iconMap[pattern.iconName] || TrendingUp;

  const statusColors = {
    forming: "bg-warning/15 text-warning border-warning/30",
    confirmed: "bg-primary/15 text-primary border-primary/30",
    completed: "bg-success/15 text-success border-success/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };

  const directionColors = {
    bullish: "text-bullish",
    bearish: "text-bearish",
    neutral: "text-warning",
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all",
        status === "forming" && "border-warning/30",
        status === "confirmed" && "border-primary/30 shadow-lg shadow-primary/10"
      )}
      data-testid={`live-pattern-${livePattern.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              pattern.direction === "bullish" ? "bg-bullish/15" :
              pattern.direction === "bearish" ? "bg-bearish/15" : "bg-warning/15"
            )}>
              <Icon className={cn("h-5 w-5", directionColors[pattern.direction])} />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{pattern.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-muted-foreground">{symbol}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">{timeframe}</span>
              </div>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={cn("capitalize text-[10px]", statusColors[status])}
          >
            {status}
          </Badge>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Confidence</span>
            <span className={cn(
              "text-xs font-mono font-semibold",
              confidence >= 80 ? "text-bullish" :
              confidence >= 60 ? "text-warning" : "text-muted-foreground"
            )}>
              {confidence}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(detectedAt, { addSuffix: true })}
            </span>
          </div>
        </div>

        {(entryPrice || stopLoss || takeProfit) && (
          <div className="grid grid-cols-3 gap-2 mb-3 p-2 rounded-md bg-muted/50">
            {entryPrice && (
              <div className="text-center">
                <Target className="h-3 w-3 mx-auto text-primary mb-1" />
                <p className="text-[10px] text-muted-foreground">Entry</p>
                <p className="text-xs font-mono font-semibold">${entryPrice.toLocaleString()}</p>
              </div>
            )}
            {stopLoss && (
              <div className="text-center">
                <ShieldAlert className="h-3 w-3 mx-auto text-bearish mb-1" />
                <p className="text-[10px] text-muted-foreground">Stop Loss</p>
                <p className="text-xs font-mono font-semibold text-bearish">${stopLoss.toLocaleString()}</p>
              </div>
            )}
            {takeProfit && (
              <div className="text-center">
                <TrendingUp className="h-3 w-3 mx-auto text-bullish mb-1" />
                <p className="text-[10px] text-muted-foreground">Take Profit</p>
                <p className="text-xs font-mono font-semibold text-bullish">${takeProfit.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-xs"
          onClick={onLearnMore}
          data-testid={`button-learn-live-${livePattern.id}`}
        >
          Learn About This Pattern
        </Button>
      </CardContent>
    </Card>
  );
}
