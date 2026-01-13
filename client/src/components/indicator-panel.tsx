import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Settings2, 
  Plus, 
  X, 
  ChevronDown, 
  ChevronUp,
  TrendingUp,
  Activity,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Indicator {
  id: string;
  name: string;
  type: "overlay" | "oscillator";
  enabled: boolean;
  settings: Record<string, number | string | boolean>;
  color: string;
}

interface IndicatorPanelProps {
  className?: string;
  onIndicatorChange?: (indicators: Indicator[]) => void;
}

const defaultIndicators: Indicator[] = [
  {
    id: "sma21",
    name: "SMA 21",
    type: "overlay",
    enabled: true,
    settings: { period: 21 },
    color: "#3b82f6",
  },
  {
    id: "sma200",
    name: "SMA 200",
    type: "overlay",
    enabled: true,
    settings: { period: 200 },
    color: "#f59e0b",
  },
  {
    id: "ema9",
    name: "EMA 9",
    type: "overlay",
    enabled: false,
    settings: { period: 9 },
    color: "#8b5cf6",
  },
  {
    id: "rsi",
    name: "RSI",
    type: "oscillator",
    enabled: false,
    settings: { period: 14, overbought: 70, oversold: 30 },
    color: "#ec4899",
  },
  {
    id: "macd",
    name: "MACD",
    type: "oscillator",
    enabled: false,
    settings: { fast: 12, slow: 26, signal: 9 },
    color: "#06b6d4",
  },
  {
    id: "bb",
    name: "Bollinger Bands",
    type: "overlay",
    enabled: false,
    settings: { period: 20, stdDev: 2 },
    color: "#10b981",
  },
  {
    id: "vwap",
    name: "VWAP",
    type: "overlay",
    enabled: false,
    settings: {},
    color: "#f43f5e",
  },
];

const availableIndicators = [
  { id: "ema", name: "EMA", type: "overlay" },
  { id: "sma", name: "SMA", type: "overlay" },
  { id: "rsi", name: "RSI", type: "oscillator" },
  { id: "macd", name: "MACD", type: "oscillator" },
  { id: "bb", name: "Bollinger Bands", type: "overlay" },
  { id: "vwap", name: "VWAP", type: "overlay" },
  { id: "atr", name: "ATR", type: "oscillator" },
  { id: "stoch", name: "Stochastic", type: "oscillator" },
  { id: "ichimoku", name: "Ichimoku Cloud", type: "overlay" },
  { id: "supertrend", name: "SuperTrend", type: "overlay" },
];

export function IndicatorPanel({ className, onIndicatorChange }: IndicatorPanelProps) {
  const [indicators, setIndicators] = useState<Indicator[]>(defaultIndicators);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null);

  const toggleIndicator = (id: string) => {
    const updated = indicators.map(ind => 
      ind.id === id ? { ...ind, enabled: !ind.enabled } : ind
    );
    setIndicators(updated);
    onIndicatorChange?.(updated);
  };

  const removeIndicator = (id: string) => {
    const updated = indicators.filter(ind => ind.id !== id);
    setIndicators(updated);
    onIndicatorChange?.(updated);
  };

  const updateSettings = (id: string, key: string, value: number | string) => {
    const updated = indicators.map(ind => 
      ind.id === id ? { ...ind, settings: { ...ind.settings, [key]: value } } : ind
    );
    setIndicators(updated);
    onIndicatorChange?.(updated);
  };

  const addIndicator = (type: string) => {
    const template = availableIndicators.find(a => a.id === type);
    if (!template) return;
    
    const newIndicator: Indicator = {
      id: `${type}-${Date.now()}`,
      name: template.name,
      type: template.type as "overlay" | "oscillator",
      enabled: true,
      settings: type === "sma" || type === "ema" ? { period: 20 } : {},
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };
    
    const updated = [...indicators, newIndicator];
    setIndicators(updated);
    onIndicatorChange?.(updated);
    setIsExpanded(false);
  };

  const enabledCount = indicators.filter(i => i.enabled).length;

  return (
    <Card className={cn("", className)} data-testid="indicator-panel">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Indicators
            <Badge variant="secondary" className="text-xs">
              {enabledCount}
            </Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-toggle-indicators"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-4 pb-4">
        {/* Add indicator dropdown */}
        {isExpanded && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-2">Add Indicator</p>
            <ScrollArea className="h-32">
              <div className="grid grid-cols-2 gap-1">
                {availableIndicators.map(ind => (
                  <Button
                    key={ind.id}
                    variant="ghost"
                    size="sm"
                    className="justify-start text-xs h-8"
                    onClick={() => addIndicator(ind.id)}
                    data-testid={`button-add-${ind.id}`}
                  >
                    {ind.type === "overlay" ? (
                      <TrendingUp className="h-3 w-3 mr-1 text-muted-foreground" />
                    ) : (
                      <BarChart3 className="h-3 w-3 mr-1 text-muted-foreground" />
                    )}
                    {ind.name}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Active indicators */}
        <div className="space-y-2">
          {indicators.map(indicator => (
            <div
              key={indicator.id}
              className={cn(
                "rounded-lg border transition-colors",
                indicator.enabled ? "bg-muted/30" : "opacity-60"
              )}
            >
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: indicator.color }}
                  />
                  <span className="text-sm font-medium">{indicator.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1">
                    {indicator.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={indicator.enabled}
                    onCheckedChange={() => toggleIndicator(indicator.id)}
                    data-testid={`switch-${indicator.id}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setExpandedIndicator(
                      expandedIndicator === indicator.id ? null : indicator.id
                    )}
                    data-testid={`button-settings-${indicator.id}`}
                  >
                    {expandedIndicator === indicator.id ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => removeIndicator(indicator.id)}
                    data-testid={`button-remove-${indicator.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Settings panel */}
              {expandedIndicator === indicator.id && Object.keys(indicator.settings).length > 0 && (
                <div className="px-2 pb-2 pt-1 border-t space-y-2">
                  {Object.entries(indicator.settings).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <Label className="text-xs capitalize">{key}</Label>
                      <Input
                        type="number"
                        value={typeof value === 'boolean' ? (value ? 1 : 0) : value}
                        onChange={(e) => updateSettings(indicator.id, key, parseInt(e.target.value) || 0)}
                        className="h-7 w-20 text-xs"
                        data-testid={`input-${indicator.id}-${key}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {indicators.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No indicators added</p>
            <p className="text-xs">Click "Add" to add indicators</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
