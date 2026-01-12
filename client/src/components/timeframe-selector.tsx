import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TimeframeSelectorProps {
  currentTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const timeframes = [
  { value: "1", label: "1m" },
  { value: "5", label: "5m" },
  { value: "15", label: "15m" },
  { value: "30", label: "30m" },
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "D", label: "1D" },
];

export function TimeframeSelector({ currentTimeframe, onTimeframeChange }: TimeframeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg" data-testid="timeframe-selector">
      {timeframes.map((tf) => (
        <Button
          key={tf.value}
          variant={currentTimeframe === tf.value ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs font-mono",
            currentTimeframe === tf.value && "bg-background shadow-sm"
          )}
          onClick={() => onTimeframeChange(tf.value)}
          data-testid={`timeframe-${tf.value}`}
        >
          {tf.label}
        </Button>
      ))}
    </div>
  );
}
