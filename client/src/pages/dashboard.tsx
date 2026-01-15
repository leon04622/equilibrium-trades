import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, Target, BookOpen, Zap, ArrowRight, 
  BarChart3, GraduationCap, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatsCard } from "@/components/stats-card";
import { PatternCard } from "@/components/pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { EducationalTip, tradingTips } from "@/components/educational-tip";
import { TradeJournal } from "@/components/trade-journal";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";

export default function Dashboard() {
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch active patterns from API
  const { data: activePatterns = [] } = useQuery<any[]>({
    queryKey: ["/api/patterns/active"],
  });

  // Fetch subscription tiers
  const { data: subscriptionTiers = [] } = useQuery<any[]>({
    queryKey: ["/api/subscriptions"],
  });

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const beginnerPatterns = tradingPatterns.filter(p => p.difficulty === "beginner").slice(0, 4);
  const patternsDetectedToday = activePatterns.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold">Welcome to Equilibrium</h1>
        <p className="text-muted-foreground">
          Your journey to mastering trading patterns starts here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Patterns Learned"
          value="3/18"
          subtitle="Keep learning!"
          icon={BookOpen}
          trend={{ value: 50, positive: true }}
        />
        <StatsCard
          title="AI Signals Today"
          value={patternsDetectedToday}
          subtitle="Active patterns detected"
          icon={Zap}
        />
        <StatsCard
          title="Win Rate"
          value="67%"
          subtitle="Based on paper trades"
          icon={Target}
          trend={{ value: 5, positive: true }}
        />
        <StatsCard
          title="Learning Streak"
          value="5 days"
          subtitle="Keep it up!"
          icon={Activity}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <div>
                <CardTitle className="font-display">Quick Start</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Jump into trading or continue learning
                </p>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link href="/trading">
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15">
                      <BarChart3 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Start Trading</h3>
                      <p className="text-sm text-muted-foreground">
                        View live charts with AI pattern detection
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
              <Link href="/learn">
                <Card className="hover-elevate cursor-pointer h-full">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/15">
                      <GraduationCap className="h-6 w-6 text-success" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">Continue Learning</h3>
                      <p className="text-sm text-muted-foreground">
                        Master your next trading pattern
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="font-display">Beginner Patterns</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Start with these easy-to-identify patterns
                </p>
              </div>
              <Link href="/patterns">
                <Button variant="ghost" size="sm" className="gap-1">
                  View All
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {beginnerPatterns.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    compact
                    onLearnMore={() => handleLearnMore(pattern)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Your Strategy</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                The Equilibrium trading method
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                <h4 className="font-semibold text-sm mb-3">SMA Crossover Strategy</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">1</Badge>
                    <p className="text-sm text-muted-foreground">
                      Watch for the 21 SMA to cross the 200 SMA on the 1-minute chart
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">2</Badge>
                    <p className="text-sm text-muted-foreground">
                      Confirm price is above the 200 SMA on the 5-minute chart for longs
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">3</Badge>
                    <p className="text-sm text-muted-foreground">
                      Look for bull flags, triangles, and continuation patterns
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0">4</Badge>
                    <p className="text-sm text-muted-foreground">
                      For shorts: when 21 crosses below 200, look for bear flags
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <TradeJournal />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Learning Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Continuation Patterns</span>
                  <span className="text-muted-foreground">2/8</span>
                </div>
                <Progress value={25} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Reversal Patterns</span>
                  <span className="text-muted-foreground">1/10</span>
                </div>
                <Progress value={10} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>SMA Strategy</span>
                  <span className="text-muted-foreground">1/3</span>
                </div>
                <Progress value={33} className="h-2" />
              </div>
              <Link href="/learn">
                <Button variant="secondary" size="sm" className="w-full mt-2">
                  Continue Learning
                </Button>
              </Link>
            </CardContent>
          </Card>

          <EducationalTip tips={tradingTips.slice(0, 4)} />

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Recent AI Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-md bg-bullish/10">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-bullish" />
                  <div>
                    <p className="text-sm font-medium">Bull Flag</p>
                    <p className="text-xs text-muted-foreground">BTC/USDT • 1m</p>
                  </div>
                </div>
                <Badge className="bg-bullish text-bullish-foreground">78%</Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-bullish/10">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-bullish" />
                  <div>
                    <p className="text-sm font-medium">Ascending Triangle</p>
                    <p className="text-xs text-muted-foreground">ETH/USDT • 5m</p>
                  </div>
                </div>
                <Badge className="bg-bullish text-bullish-foreground">72%</Badge>
              </div>
              <Link href="/signals">
                <Button variant="ghost" size="sm" className="w-full gap-1">
                  View All Signals
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <PatternModal
        pattern={selectedPattern}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
