import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CandlestickChart, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Search,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { candlestickPatterns, type CandlestickPattern } from "@/lib/candlestick-patterns";
import { CandlestickPatternImage } from "@/components/candlestick-pattern-image";

export default function Candles() {
  const [search, setSearch] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<CandlestickPattern | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const filteredPatterns = candlestickPatterns.filter(pattern => {
    const matchesSearch = pattern.name.toLowerCase().includes(search.toLowerCase()) ||
      pattern.description.toLowerCase().includes(search.toLowerCase());
    
    if (activeTab === "all") return matchesSearch;
    if (activeTab === "bullish") return matchesSearch && pattern.type === "bullish";
    if (activeTab === "bearish") return matchesSearch && pattern.type === "bearish";
    if (activeTab === "neutral") return matchesSearch && pattern.type === "neutral";
    if (activeTab === "single") return matchesSearch && pattern.category === "single";
    if (activeTab === "double") return matchesSearch && pattern.category === "double";
    if (activeTab === "triple") return matchesSearch && pattern.category === "triple";
    return matchesSearch;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "bullish": return <TrendingUp className="h-4 w-4" />;
      case "bearish": return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  const getReliabilityBadge = (reliability: string) => {
    switch (reliability) {
      case "high":
        return <Badge variant="outline" className="bg-bullish/15 text-bullish border-bullish/30">High Reliability</Badge>;
      case "moderate":
        return <Badge variant="outline" className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">Moderate</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Low</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case "single": return <Badge variant="secondary">1 Candle</Badge>;
      case "double": return <Badge variant="secondary">2 Candles</Badge>;
      case "triple": return <Badge variant="secondary">3 Candles</Badge>;
      default: return null;
    }
  };

  const handlePatternClick = (pattern: CandlestickPattern) => {
    setSelectedPattern(pattern);
    setModalOpen(true);
  };

  const bullishCount = candlestickPatterns.filter(p => p.type === "bullish").length;
  const bearishCount = candlestickPatterns.filter(p => p.type === "bearish").length;
  const neutralCount = candlestickPatterns.filter(p => p.type === "neutral").length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CandlestickChart className="h-8 w-8 text-primary" />
          <h1 className="text-2xl md:text-3xl font-display font-bold">Candlestick Patterns</h1>
        </div>
        <p className="text-muted-foreground">
          Learn to read price action through Japanese candlestick patterns
        </p>
      </div>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-bullish/10">
              <TrendingUp className="h-8 w-8 text-bullish" />
              <div>
                <p className="text-2xl font-bold">{bullishCount}</p>
                <p className="text-sm text-muted-foreground">Bullish Patterns</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-bearish/10">
              <TrendingDown className="h-8 w-8 text-bearish" />
              <div>
                <p className="text-2xl font-bold">{bearishCount}</p>
                <p className="text-sm text-muted-foreground">Bearish Patterns</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Minus className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{neutralCount}</p>
                <p className="text-sm text-muted-foreground">Neutral Patterns</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patterns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-candles"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="w-full md:w-auto" data-testid="tabs-candles">
            <TabsTrigger value="all" data-testid="tab-all">All ({candlestickPatterns.length})</TabsTrigger>
            <TabsTrigger value="bullish" data-testid="tab-bullish" className="text-bullish">Bullish</TabsTrigger>
            <TabsTrigger value="bearish" data-testid="tab-bearish" className="text-bearish">Bearish</TabsTrigger>
            <TabsTrigger value="single" data-testid="tab-single">1 Candle</TabsTrigger>
            <TabsTrigger value="double" data-testid="tab-double">2 Candles</TabsTrigger>
            <TabsTrigger value="triple" data-testid="tab-triple">3 Candles</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={activeTab} className="space-y-4">
          {filteredPatterns.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CandlestickChart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No patterns found matching your search.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredPatterns.map((pattern) => (
                <Card
                  key={pattern.id}
                  className="cursor-pointer hover-elevate transition-all"
                  onClick={() => handlePatternClick(pattern)}
                  data-testid={`card-pattern-${pattern.id}`}
                >
                  <CandlestickPatternImage
                    patternId={pattern.id}
                    alt={`${pattern.name} candlestick pattern`}
                    className="h-52 w-full rounded-t-lg border-b border-border/60"
                    imgClassName="p-3"
                  />
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-lg",
                          pattern.type === "bullish" && "bg-bullish/15 text-bullish",
                          pattern.type === "bearish" && "bg-bearish/15 text-bearish",
                          pattern.type === "neutral" && "bg-muted text-muted-foreground"
                        )}>
                          {getTypeIcon(pattern.type)}
                        </div>
                        <div>
                          <CardTitle className="text-base">{pattern.name}</CardTitle>
                          <div className="flex items-center gap-1 mt-1">
                            {getCategoryBadge(pattern.category)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {pattern.description}
                    </p>
                    <div className="flex items-center justify-between">
                      {getReliabilityBadge(pattern.reliability)}
                      <Button variant="ghost" size="sm" data-testid={`button-learn-${pattern.id}`}>
                        <BookOpen className="h-4 w-4 mr-1" />
                        Learn
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]" data-testid="modal-candlestick-pattern">
          {selectedPattern && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-xl",
                    selectedPattern.type === "bullish" && "bg-bullish/15 text-bullish",
                    selectedPattern.type === "bearish" && "bg-bearish/15 text-bearish",
                    selectedPattern.type === "neutral" && "bg-muted text-muted-foreground"
                  )}>
                    {getTypeIcon(selectedPattern.type)}
                  </div>
                  <div>
                    <DialogTitle className="text-xl">{selectedPattern.name}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={
                        selectedPattern.type === "bullish" ? "default" :
                        selectedPattern.type === "bearish" ? "destructive" : "secondary"
                      }>
                        {selectedPattern.type.charAt(0).toUpperCase() + selectedPattern.type.slice(1)}
                      </Badge>
                      {getCategoryBadge(selectedPattern.category)}
                      {getReliabilityBadge(selectedPattern.reliability)}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-6 py-4">
                  <CandlestickPatternImage
                    patternId={selectedPattern.id}
                    alt={`${selectedPattern.name} candlestick pattern diagram`}
                    className="h-64 w-full rounded-lg border"
                    imgClassName="p-4"
                  />

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-2">
                      <Info className="h-4 w-4 text-primary" />
                      Description
                    </h3>
                    <p className="text-muted-foreground">{selectedPattern.description}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Psychology Behind the Pattern
                    </h3>
                    <p className="text-muted-foreground">{selectedPattern.psychology}</p>
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      How to Identify
                    </h3>
                    <ul className="space-y-2">
                      {selectedPattern.howToIdentify.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xs font-medium mt-0.5">
                            {i + 1}
                          </div>
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Trading Implication
                    </h3>
                    <div className={cn(
                      "p-4 rounded-lg border",
                      selectedPattern.type === "bullish" && "bg-bullish/5 border-bullish/20",
                      selectedPattern.type === "bearish" && "bg-bearish/5 border-bearish/20",
                      selectedPattern.type === "neutral" && "bg-muted/50 border-border"
                    )}>
                      <p className="text-sm">{selectedPattern.tradingImplication}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>Remember:</strong> No single candlestick pattern should be used in isolation. 
                      Always combine with other technical analysis tools like support/resistance levels, 
                      moving averages (especially 21 and 200 SMA), and volume for confirmation.
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
