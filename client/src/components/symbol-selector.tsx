import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Star, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Ticker {
  coin: string;
  displayName?: string;
  baseName?: string;
  isSpot?: boolean;
  markPx: string;
  midPx: string;
  prevDayPx: string;
  dayNtlVlm?: string;
  openInterest?: string;
  funding?: string;
  maxLeverage?: number;
  onlyIsolated?: boolean;
}

interface SymbolSelectorProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

type SortKey = "vol" | "oi" | "change" | "price" | "funding";
type SortDir = "desc" | "asc";
type Category = "all" | "perps" | "spot" | "trending" | "favorites";

const FAVORITES_KEY = "hl_favorites";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set(["BTC", "ETH", "SOL"]);
  } catch {
    return new Set(["BTC", "ETH", "SOL"]);
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

function fmtPrice(p: number) {
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.001) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtVol(v: number) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtFunding(f: number) {
  return `${f >= 0 ? "+" : ""}${(f * 100).toFixed(4)}%`;
}

export function SymbolSelector({ currentSymbol, onSymbolChange }: SymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sortKey, setSortKey] = useState<SortKey>("vol");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { data: tickers = [], isLoading } = useQuery<Ticker[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 3000,
  });

  const currentTicker = tickers.find(t => t.coin === currentSymbol);
  const price = currentTicker ? parseFloat(currentTicker.markPx) : 0;
  const prevPrice = currentTicker ? parseFloat(currentTicker.prevDayPx) : price;
  const change = prevPrice > 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
  const currentLeverage = currentTicker?.maxLeverage || 50;
  const isCurrentSpot = currentTicker?.isSpot || false;

  function getTickerLabel(t: Ticker): string {
    if (t.displayName) return t.displayName;
    if (t.isSpot) return t.coin;
    return `${t.coin}-USDC`;
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleFavorite(e: React.MouseEvent, coin: string) {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(coin)) next.delete(coin);
      else next.add(coin);
      saveFavorites(next);
      return next;
    });
  }

  const processed = tickers.map(t => {
    const px = parseFloat(t.markPx) || 0;
    const prev = parseFloat(t.prevDayPx) || px;
    const chg = prev > 0 ? ((px - prev) / prev) * 100 : 0;
    const vol = parseFloat(t.dayNtlVlm || "0");
    const oi = parseFloat(t.openInterest || "0");
    const fund = parseFloat(t.funding || "0");
    return { ...t, px, chg, vol, oi, fund };
  });

  const filtered = processed
    .filter(t => {
      if (search) {
        const q = search.toLowerCase();
        return t.coin.toLowerCase().includes(q) ||
          (t.displayName || "").toLowerCase().includes(q) ||
          (t.baseName || "").toLowerCase().includes(q);
      }
      if (category === "perps") return !t.isSpot;
      if (category === "spot") return !!t.isSpot;
      if (category === "trending") return t.vol > 1_000_000;
      if (category === "favorites") return favorites.has(t.coin);
      return true;
    })
    .sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "vol") { av = a.vol; bv = b.vol; }
      else if (sortKey === "oi") { av = a.oi; bv = b.oi; }
      else if (sortKey === "change") { av = a.chg; bv = b.chg; }
      else if (sortKey === "price") { av = a.px; bv = b.px; }
      else if (sortKey === "funding") { av = a.fund; bv = b.fund; }
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 text-primary" />
      : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  const ColHeader = ({ label, col, className }: { label: string; col: SortKey; className?: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className={cn("flex items-center gap-0.5 text-[10px] text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors", className)}
    >
      {label}
      <SortIcon col={col} />
    </button>
  );

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-accent transition-colors"
        data-testid="button-symbol-selector"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20">
          <span className="text-[11px] font-bold text-primary">
            {(currentTicker?.baseName || currentSymbol)?.slice(0, 1) || "B"}
          </span>
        </div>
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">
              {currentTicker ? getTickerLabel(currentTicker) : `${currentSymbol || "BTC"}-USDC`}
            </span>
            {!isCurrentSpot && (
              <span className="text-[10px] font-semibold text-muted-foreground border border-border rounded px-1 py-0">{currentLeverage}x</span>
            )}
            {isCurrentSpot && (
              <span className="text-[10px] font-semibold text-blue-400 border border-blue-400/30 bg-blue-400/10 rounded px-1 py-0">Spot</span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
          </div>
        </div>
      </button>

      {/* Market panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-1 z-50 w-[680px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {/* Search bar + category tabs */}
          <div className="border-b border-border">
            <div className="flex items-center gap-2 p-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search markets..."
                  className="pl-8 h-8 text-sm bg-background"
                  value={search}
                  onChange={e => { setSearch(e.target.value); if (e.target.value) setCategory("all"); }}
                  data-testid="input-symbol-search"
                  autoFocus
                />
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-0 px-2 pb-0">
              {([
                { id: "all", label: "All" },
                { id: "perps", label: "Perps" },
                { id: "spot", label: "Spot" },
                { id: "trending", label: "🔥 Trending" },
                { id: "favorites", label: "⭐ Favorites" },
              ] as { id: Category; label: string }[]).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => { setCategory(id); setSearch(""); }}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                    category === id && !search
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto pr-1 text-[10px] text-muted-foreground">
                {filtered.length} markets
              </div>
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[20px_1fr_100px_90px_80px_100px_110px] items-center gap-1 px-3 py-2 border-b border-border/50 bg-muted/30">
            <div />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Symbol</span>
            <ColHeader label="Last Price" col="price" className="justify-end" />
            <ColHeader label="24h Change" col="change" className="justify-end" />
            <ColHeader label="Funding" col="funding" className="justify-end" />
            <ColHeader label="Volume" col="vol" className="justify-end" />
            <ColHeader label="Open Interest" col="oi" className="justify-end" />
          </div>

          {/* Rows */}
          <div className="overflow-y-auto" style={{ maxHeight: "420px" }}>
            {isLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No markets found
              </div>
            ) : (
              filtered.map(ticker => (
                <button
                  key={ticker.coin}
                  className={cn(
                    "w-full grid grid-cols-[20px_1fr_100px_90px_80px_100px_110px] items-center gap-1 px-3 py-2 text-left hover:bg-accent/50 transition-colors",
                    currentSymbol === ticker.coin && "bg-primary/10 hover:bg-primary/15"
                  )}
                  onClick={() => { onSymbolChange(ticker.coin); setOpen(false); }}
                  data-testid={`symbol-${ticker.coin}`}
                >
                  {/* Star */}
                  <span
                    onClick={e => toggleFavorite(e, ticker.coin)}
                    className={cn(
                      "flex items-center justify-center cursor-pointer transition-colors",
                      favorites.has(ticker.coin) ? "text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-300"
                    )}
                    data-testid={`star-${ticker.coin}`}
                  >
                    <Star className="h-3 w-3" fill={favorites.has(ticker.coin) ? "currentColor" : "none"} />
                  </span>

                  {/* Symbol + leverage / spot badge */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-sm font-semibold truncate">{getTickerLabel(ticker)}</span>
                    {ticker.isSpot ? (
                      <span className="shrink-0 text-[10px] font-medium px-1 rounded border text-blue-400 border-blue-400/30 bg-blue-400/10">
                        Spot
                      </span>
                    ) : (
                      <span className={cn(
                        "shrink-0 text-[10px] font-medium px-1 rounded border",
                        ticker.onlyIsolated
                          ? "text-orange-400 border-orange-400/30 bg-orange-400/10"
                          : "text-primary border-primary/30 bg-primary/10"
                      )}>
                        {ticker.maxLeverage || 50}x
                      </span>
                    )}
                  </div>

                  {/* Last Price */}
                  <span className="font-mono text-sm text-right">
                    {fmtPrice(ticker.px)}
                  </span>

                  {/* 24h Change */}
                  <span className={cn(
                    "font-mono text-sm text-right",
                    ticker.chg >= 0 ? "text-bullish" : "text-bearish"
                  )}>
                    {ticker.chg >= 0 ? "+" : ""}{ticker.chg.toFixed(2)}%
                  </span>

                  {/* Funding */}
                  <span className={cn(
                    "font-mono text-xs text-right",
                    ticker.fund >= 0 ? "text-bullish" : "text-bearish"
                  )}>
                    {fmtFunding(ticker.fund)}
                  </span>

                  {/* Volume */}
                  <span className="font-mono text-xs text-right text-muted-foreground">
                    {fmtVol(ticker.vol)}
                  </span>

                  {/* Open Interest */}
                  <span className="font-mono text-xs text-right text-muted-foreground">
                    {fmtVol(ticker.oi)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
