import { useState } from "react";
import { Search, BookOpen, TrendingUp, TrendingDown, Minus, Sparkles, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatternCard } from "@/components/pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StatePanel } from "@/components/state-panel";

export default function Patterns() {
  const [search, setSearch] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);

  const handleLearnMore = (pattern: PatternDefinition) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const filterPatterns = (patterns: PatternDefinition[]) => {
    return patterns.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      const matchesDifficulty = !difficultyFilter || p.difficulty === difficultyFilter;
      return matchesSearch && matchesDifficulty;
    });
  };

  const continuationPatterns = filterPatterns(tradingPatterns.filter(p => p.type === "continuation"));
  const reversalPatterns = filterPatterns(tradingPatterns.filter(p => p.type === "reversal"));
  const allFilteredPatterns = filterPatterns(tradingPatterns);

  const difficulties = ["beginner", "intermediate", "advanced"];

  return (
    <div className="p-6 space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/90 text-primary-foreground">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Structured Pattern Playbook
                </Badge>
                <Badge variant="outline" className="border-primary/20 bg-background/70">
                  Same language as the live scanner
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold">Pattern Library</h1>
              </div>
              <p className="max-w-2xl text-muted-foreground">
                Master classic chart patterns plus the same structures the <span className="font-medium text-foreground">AI Signals</span>{" "}
                scanner surfaces, from continuation flags and triangles to reversals and wedges.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">Reference before execution</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review the visual structure, context, and intent behind each setup before taking a trade.
                </p>
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold">Aligned with the platform</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Educational definitions here are intentionally matched to the workflows members see elsewhere in Equilibrium.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <h2 className="text-2xl font-display font-bold">Explore Setups</h2>
        </div>
        <p className="text-muted-foreground">Search by structure or filter by complexity to build pattern fluency faster.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patterns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-pattern-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={difficultyFilter === null ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setDifficultyFilter(null)}
            data-testid="filter-all"
          >
            All Levels
          </Button>
          {difficulties.map(diff => (
            <Button
              key={diff}
              variant={difficultyFilter === diff ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDifficultyFilter(difficultyFilter === diff ? null : diff)}
              className="capitalize"
              data-testid={`filter-${diff}`}
            >
              {diff}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg bg-card border p-4">
          <p className="text-sm text-muted-foreground">Total Patterns</p>
          <p className="text-2xl font-bold font-display">{tradingPatterns.length}</p>
        </div>
        <div className="rounded-lg bg-bullish/10 border border-bullish/20 p-4">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-bullish" />
            Bullish
          </p>
          <p className="text-2xl font-bold font-display text-bullish">
            {tradingPatterns.filter(p => p.direction === "bullish").length}
          </p>
        </div>
        <div className="rounded-lg bg-bearish/10 border border-bearish/20 p-4">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-bearish" />
            Bearish
          </p>
          <p className="text-2xl font-bold font-display text-bearish">
            {tradingPatterns.filter(p => p.direction === "bearish").length}
          </p>
        </div>
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-4">
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Minus className="h-3 w-3 text-warning" />
            Neutral
          </p>
          <p className="text-2xl font-bold font-display text-warning">
            {tradingPatterns.filter(p => p.direction === "neutral").length}
          </p>
        </div>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            All ({allFilteredPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="continuation" data-testid="tab-continuation">
            Continuation ({continuationPatterns.length})
          </TabsTrigger>
          <TabsTrigger value="reversal" data-testid="tab-reversal">
            Reversal ({reversalPatterns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {allFilteredPatterns.length === 0 ? (
            <StatePanel
              icon={<BookOpen className="h-6 w-6" />}
              title="No patterns matched those filters"
              description="Try a broader search or clear the difficulty filter to explore the full pattern library."
              className="border-none bg-transparent shadow-none"
              contentClassName="min-h-[280px] px-0"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allFilteredPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onLearnMore={() => handleLearnMore(pattern)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="continuation" className="space-y-4">
          {continuationPatterns.length === 0 ? (
            <StatePanel
              icon={<TrendingUp className="h-6 w-6" />}
              title="No continuation setups matched"
              description="Try broadening your search or removing the current difficulty filter."
              className="border-none bg-transparent shadow-none"
              contentClassName="min-h-[220px] px-0"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {continuationPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onLearnMore={() => handleLearnMore(pattern)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reversal" className="space-y-4">
          {reversalPatterns.length === 0 ? (
            <StatePanel
              icon={<TrendingDown className="h-6 w-6" />}
              title="No reversal setups matched"
              description="Try broadening your search or removing the current difficulty filter."
              className="border-none bg-transparent shadow-none"
              contentClassName="min-h-[220px] px-0"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reversalPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  onLearnMore={() => handleLearnMore(pattern)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <PatternModal
        pattern={selectedPattern}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
