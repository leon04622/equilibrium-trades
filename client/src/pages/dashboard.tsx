import { Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  Target,
  BookOpen,
  Zap,
  ArrowRight,
  BarChart3,
  GraduationCap,
  Activity,
  Shield,
  Sparkles,
  PlayCircle,
  BookMarked,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatsCard } from "@/components/stats-card";
import { PatternCard } from "@/components/pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { EducationalTip, tradingTips } from "@/components/educational-tip";
import { LazyJournalView } from "@/components/journal-view.lazy";
import { PoweredByHyperliquid } from "@/components/powered-by-hyperliquid";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";

export default function Dashboard() {
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch active patterns from API
  const { data: activePatterns = [] } = useQuery<unknown[]>({
    queryKey: ["/api/patterns/active"],
  });

  const { data: subscriptionTiers = [] } = useQuery<unknown[]>({
    queryKey: ["/api/subscriptions"],
  });

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const beginnerPatterns = tradingPatterns.filter(p => p.difficulty === "beginner").slice(0, 4);
  const patternsDetectedToday = activePatterns.length || 0;
  const premiumHighlights = [
    {
      icon: Zap,
      title: "Live AI workflow",
      body: "Scan markets, validate structure, and move straight into execution without changing tools.",
    },
    {
      icon: Shield,
      title: "Built for discipline",
      body: "Journal, education, and structured setups reinforce consistency instead of impulse trading.",
    },
    {
      icon: GraduationCap,
      title: "Education with context",
      body: "Patterns, SMA methodology, and vault lessons are tied directly to the way the platform is used.",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/12 via-background to-background shadow-xl shadow-primary/5">
        <CardContent className="relative p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
          <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="relative grid grid-cols-1 gap-8 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/90 text-primary-foreground">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Equilibrium Pro Workflow
                </Badge>
                <Badge variant="outline" className="border-primary/25 bg-background/70">
                  Trade, learn, and review in one place
                </Badge>
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-display font-bold tracking-tight md:text-5xl">
                  A cleaner, calmer trading workspace built for disciplined execution.
                </h1>
                <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                  Equilibrium combines market structure, live execution, education, and review so members can move
                  from idea to decision without stitching together multiple tools.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-primary/20 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Signals today</p>
                  <p className="mt-2 text-2xl font-display font-bold">{patternsDetectedToday}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Live AI-detected setups currently in the feed</p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Trading stack</p>
                  <p className="mt-2 text-2xl font-display font-bold">21/200</p>
                  <p className="mt-1 text-xs text-muted-foreground">SMA structure embedded into learning and execution</p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-background/70 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Member flow</p>
                  <p className="mt-2 text-2xl font-display font-bold">Journal</p>
                  <p className="mt-1 text-xs text-muted-foreground">Review decisions and build repeatable habits</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/trading">
                    Open Trading Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2 bg-background/70">
                  <Link to="/videos">
                    Watch The Vault
                    <PlayCircle className="h-4 w-4" />
                  </Link>
                </Button>
                <PoweredByHyperliquid className="sm:ml-1" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {premiumHighlights.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm backdrop-blur"
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Link to="/trading">
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
              <Link to="/learn">
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
              <Link to="/patterns">
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

          <Suspense
            fallback={
              <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-border/70 bg-card/40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              </div>
            }
          >
            <LazyJournalView variant="embedded" />
          </Suspense>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/15 bg-gradient-to-br from-background to-primary/5">
            <CardHeader>
              <CardTitle className="font-display text-base">Platform Edge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <BookMarked className="h-4 w-4 text-primary" />
                  Education tied to execution
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Learn a concept, see it in the signal flow, then document the result in the same account.
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4 text-primary" />
                  Cleaner decision environment
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The product is built to reduce context switching and help members stick to one process.
                </p>
              </div>
            </CardContent>
          </Card>

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
              <Link to="/learn">
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
              <Link to="/signals">
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
