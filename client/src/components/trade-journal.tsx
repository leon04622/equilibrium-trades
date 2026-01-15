import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Trophy, TrendingUp, TrendingDown, Target, Shield, 
  Zap, BarChart3, ChevronRight, Award, AlertTriangle
} from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { cn } from "@/lib/utils";
import type { TradeGrade, WeeklyStats } from "@shared/schema";

function GradeBadge({ grade, label }: { grade: "A" | "B" | "C" | "D" | "F"; label: string }) {
  const colors = {
    A: "bg-green-500/20 text-green-400 border-green-500/30",
    B: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    F: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <Badge className={cn("text-lg font-bold px-3 py-1", colors[grade])}>
        {grade}
      </Badge>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ScoreCircle({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "w-10 h-10 text-sm",
    md: "w-14 h-14 text-lg",
    lg: "w-20 h-20 text-2xl",
  };
  
  const color = score >= 80 ? "text-green-400 border-green-500" 
    : score >= 60 ? "text-yellow-400 border-yellow-500" 
    : "text-red-400 border-red-500";
  
  return (
    <div className={cn(
      "rounded-full border-2 flex items-center justify-center font-bold",
      sizes[size],
      color
    )}>
      {score}
    </div>
  );
}

function TradeCard({ trade }: { trade: TradeGrade }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Card className="hover-elevate cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScoreCircle score={trade.totalScore} size="sm" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{trade.coin}</span>
                <Badge variant={trade.side === "long" ? "default" : "destructive"} className="text-[10px]">
                  {trade.side.toUpperCase()}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {trade.patternType || "No pattern"} • {trade.timeframe || "N/A"}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={cn(
                "font-mono font-semibold",
                trade.pnl >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">
                {trade.pnlPercent >= 0 ? "+" : ""}{trade.pnlPercent.toFixed(1)}%
              </div>
            </div>
            
            <div className="flex gap-1">
              <GradeBadge grade={trade.setupGrade} label="Setup" />
              <GradeBadge grade={trade.executionGrade} label="Exec" />
            </div>
            
            <ChevronRight className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )} />
          </div>
        </div>
        
        {expanded && (
          <div className="mt-4 pt-3 border-t space-y-3">
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Entry</div>
                <Progress value={trade.entryScore} className="h-2" />
                <div className="text-xs mt-1">{trade.entryScore}/100</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Stop</div>
                <Progress value={trade.stopScore} className="h-2" />
                <div className="text-xs mt-1">{trade.stopScore}/100</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">R:R</div>
                <Progress value={trade.rrScore} className="h-2" />
                <div className="text-xs mt-1">{trade.rrScore}/100</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Leverage</div>
                <Progress value={trade.leverageScore} className="h-2" />
                <div className="text-xs mt-1">{trade.leverageScore}/100</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Setup</div>
                <Progress value={trade.setupScore} className="h-2" />
                <div className="text-xs mt-1">{trade.setupScore}/100</div>
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Feedback:</div>
              {trade.notes.map((note, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  {note.includes("Excellent") || note.includes("Winner") ? (
                    <Trophy className="h-3 w-3 text-green-400 mt-0.5 flex-shrink-0" />
                  ) : note.includes("consider") || note.includes("improve") ? (
                    <AlertTriangle className="h-3 w-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  {note}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Entry:</span>{" "}
                <span className="font-mono">${trade.entryPrice.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Exit:</span>{" "}
                <span className="font-mono">${trade.exitPrice.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">SL:</span>{" "}
                <span className="font-mono">${trade.stopLoss.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">TP:</span>{" "}
                <span className="font-mono">${trade.takeProfit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TradeJournal() {
  const { address, isConnected } = useWallet();
  
  const { data: trades = [], isLoading: tradesLoading } = useQuery<TradeGrade[]>({
    queryKey: [`/api/journal/trades/${address}`],
    enabled: !!address && address.length > 0,
    staleTime: 30000,
  });
  
  const { data: weeklyStats } = useQuery<WeeklyStats | null>({
    queryKey: [`/api/journal/weekly/${address}`],
    enabled: !!address && address.length > 0,
    staleTime: 30000,
  });
  
  if (!isConnected || !address) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Trade Journal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Connect your wallet to see your trade journal</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {weeklyStats && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Award className="h-5 w-5 text-primary" />
              Weekly Discipline Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <ScoreCircle score={weeklyStats.disciplineScore} size="lg" />
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">This Week's Stats</div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {weeklyStats.totalTrades} trades
                    </span>
                    <span className="flex items-center gap-1 text-green-400">
                      <TrendingUp className="h-4 w-4" />
                      {weeklyStats.winningTrades} wins
                    </span>
                    <span className="flex items-center gap-1 text-red-400">
                      <TrendingDown className="h-4 w-4" />
                      {weeklyStats.losingTrades} losses
                    </span>
                  </div>
                  <div className={cn(
                    "font-mono font-semibold",
                    weeklyStats.totalPnl >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {weeklyStats.totalPnl >= 0 ? "+" : ""}${weeklyStats.totalPnl.toFixed(2)} P&L
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Avg Trade Score</div>
                <div className="text-2xl font-bold">{weeklyStats.avgScore}/100</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Trade Journal
          </CardTitle>
          <Badge variant="outline">{trades.length} trades</Badge>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading trades...
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No graded trades yet</p>
              <p className="text-xs mt-1">Close a position to see your trade automatically graded</p>
              <p className="text-xs mt-2">Each trade is scored on entry, stop, R:R, leverage, and setup</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-2">
                {trades.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
