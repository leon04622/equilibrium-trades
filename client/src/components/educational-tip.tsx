import { Lightbulb, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface EducationalTipProps {
  tips: string[];
}

export function EducationalTip({ tips }: EducationalTipProps) {
  const [currentTip, setCurrentTip] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || tips.length === 0) return null;

  return (
    <Card className="bg-primary/5 border-primary/20" data-testid="educational-tip">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <Lightbulb className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-sm font-semibold text-primary">Trading Tip</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
                data-testid="button-dismiss-tip"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tips[currentTip]}
            </p>
            {tips.length > 1 && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex gap-1">
                  {tips.map((_, i) => (
                    <button
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentTip 
                          ? "w-4 bg-primary" 
                          : "w-1.5 bg-primary/30 hover:bg-primary/50"
                      }`}
                      onClick={() => setCurrentTip(i)}
                      data-testid={`tip-indicator-${i}`}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs h-7 px-2"
                  onClick={() => setCurrentTip((prev) => (prev + 1) % tips.length)}
                  data-testid="button-next-tip"
                >
                  Next tip
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const tradingTips = [
  "Always use the 21 SMA and 200 SMA together. When the 21 crosses above the 200 on the 1-minute chart, and price is above the 5-minute 200 SMA, look for bullish patterns.",
  "Never risk more than 1-2% of your trading capital on a single trade. This ensures you can survive losing streaks.",
  "Bull flags form after a strong upward move. Look for decreasing volume during the flag, then enter on the breakout with volume confirmation.",
  "When looking for shorts, wait for the 21 SMA to cross below the 200 SMA. Then look for bear flags and other bearish patterns.",
  "Patience is key. Don't force trades - wait for clean pattern setups with high confidence signals.",
  "Always have a clear exit strategy before entering any trade. Know your stop loss and take profit levels.",
  "Volume confirms price action. A breakout without volume is more likely to fail.",
  "The best trades come when multiple factors align: SMA crossover, clean pattern, volume, and proper risk/reward.",
];
