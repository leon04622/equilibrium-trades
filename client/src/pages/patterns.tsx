import { useState } from "react";
import { Search, Filter, BookOpen, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatternCard } from "@/components/pattern-card";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";

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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Pattern Library</h1>
        </div>
        <p className="text-muted-foreground">
          Master classic chart patterns plus the same structures the{" "}
          <span className="text-foreground font-medium">AI Signals</span> scanner surfaces — SMMA crossovers, Apex
          flags, triangles, wedges, and reversals.
        </p>
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
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No patterns found</p>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </div>
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
            <div className="text-center py-12">
              <p className="text-muted-foreground">No continuation patterns match your filters</p>
            </div>
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
            <div className="text-center py-12">
              <p className="text-muted-foreground">No reversal patterns match your filters</p>
            </div>
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
