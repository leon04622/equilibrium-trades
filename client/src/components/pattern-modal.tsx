import { 
  TrendingUp, TrendingDown, Triangle, Flag, Coffee, Activity, 
  ArrowBigDown, ArrowBigUp, ChevronsDown, ChevronsUp, Diamond,
  ArrowUpRight, ArrowDownRight, Circle, ArrowUpCircle, ArrowDownCircle,
  Sunrise, Sunset, Minimize2, X, CheckCircle2, Target, ShieldCheck,
  type LucideIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PatternDiagram } from "@/components/pattern-diagram";
import { cn } from "@/lib/utils";
import type { PatternDefinition } from "@shared/schema";

const iconMap: Record<string, LucideIcon> = {
  TrendingUp, TrendingDown, Triangle, Flag, Coffee, Activity,
  ArrowBigDown, ArrowBigUp, ChevronsDown, ChevronsUp, Diamond,
  ArrowUpRight, ArrowDownRight, Circle, ArrowUpCircle, ArrowDownCircle,
  Sunrise, Sunset, Minimize2,
};

interface PatternModalProps {
  pattern: PatternDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatternModal({ pattern, open, onOpenChange }: PatternModalProps) {
  if (!pattern) return null;

  const Icon = iconMap[pattern.iconName] || TrendingUp;

  const directionColors = {
    bullish: "text-bullish bg-bullish/15",
    bearish: "text-bearish bg-bearish/15",
    neutral: "text-warning bg-warning/15",
  };

  const difficultyColors = {
    beginner: "bg-success/15 text-success border-success/20",
    intermediate: "bg-warning/15 text-warning border-warning/20",
    advanced: "bg-destructive/15 text-destructive border-destructive/20",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={cn(
                "flex h-14 w-14 items-center justify-center rounded-xl",
                directionColors[pattern.direction]
              )}>
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <DialogTitle className="text-xl font-display">
                  {pattern.name}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge 
                    variant="outline" 
                    className={cn("capitalize", difficultyColors[pattern.difficulty])}
                  >
                    {pattern.difficulty}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {pattern.type}
                  </Badge>
                  <Badge 
                    variant="secondary"
                    className={cn(
                      "capitalize",
                      pattern.direction === "bullish" ? "bg-bullish/15 text-bullish" :
                      pattern.direction === "bearish" ? "bg-bearish/15 text-bearish" :
                      "bg-warning/15 text-warning"
                    )}
                  >
                    {pattern.direction}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-3xl font-mono font-bold",
                pattern.successRate >= 70 ? "text-bullish" :
                pattern.successRate >= 60 ? "text-warning" : "text-foreground"
              )}>
                {pattern.successRate}%
              </div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="px-6 pb-6 space-y-6">
            {/* Pattern Diagram */}
            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
                Pattern Visualization
              </h3>
              <PatternDiagram patternId={pattern.id} className="h-32" />
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">
                Description
              </h3>
              <p className="text-foreground leading-relaxed">
                {pattern.description}
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                How to Identify
              </h3>
              <ul className="space-y-2">
                {pattern.howToIdentify.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="text-sm text-muted-foreground pt-0.5">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg bg-bullish/5 border border-bullish/20 p-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-bullish mb-2">
                  <Target className="h-4 w-4" />
                  Entry Strategy
                </h3>
                <p className="text-sm text-muted-foreground">
                  {pattern.entryStrategy}
                </p>
              </div>

              <div className="rounded-lg bg-bearish/5 border border-bearish/20 p-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-bearish mb-2">
                  <ShieldCheck className="h-4 w-4" />
                  Exit Strategy
                </h3>
                <p className="text-sm text-muted-foreground">
                  {pattern.exitStrategy}
                </p>
              </div>
            </div>

            <Separator />

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
              <h3 className="font-semibold text-sm text-primary mb-2">
                Pro Tip
              </h3>
              <p className="text-sm text-muted-foreground">
                Always wait for confirmation before entering. Volume is your friend - 
                look for volume spikes on breakouts to validate the pattern. Remember, 
                a {pattern.successRate}% success rate means about {100 - pattern.successRate}% of trades 
                may not work out - always use proper risk management!
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-muted/30">
          <Button 
            className="w-full" 
            onClick={() => onOpenChange(false)}
            data-testid="button-close-pattern-modal"
          >
            Got it!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
