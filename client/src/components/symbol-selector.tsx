import { useState } from "react";
import { Search, Star, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Symbol {
  id: string;
  name: string;
  fullName: string;
  price: number;
  change: number;
  favorite?: boolean;
}

interface SymbolSelectorProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

const popularSymbols: Symbol[] = [
  { id: "BINANCE:BTCUSDT", name: "BTC/USDT", fullName: "Bitcoin", price: 98432, change: 2.34 },
  { id: "BINANCE:ETHUSDT", name: "ETH/USDT", fullName: "Ethereum", price: 3421, change: -1.23 },
  { id: "BINANCE:SOLUSDT", name: "SOL/USDT", fullName: "Solana", price: 187.50, change: 5.67 },
  { id: "BINANCE:BNBUSDT", name: "BNB/USDT", fullName: "Binance Coin", price: 612, change: 0.89 },
  { id: "BINANCE:XRPUSDT", name: "XRP/USDT", fullName: "Ripple", price: 2.34, change: -0.45 },
  { id: "BINANCE:ADAUSDT", name: "ADA/USDT", fullName: "Cardano", price: 0.98, change: 3.21 },
  { id: "BINANCE:DOGEUSDT", name: "DOGE/USDT", fullName: "Dogecoin", price: 0.38, change: -2.10 },
  { id: "BINANCE:DOTUSDT", name: "DOT/USDT", fullName: "Polkadot", price: 7.85, change: 1.56 },
];

export function SymbolSelector({ currentSymbol, onSymbolChange }: SymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const currentSymbolData = popularSymbols.find(s => s.id === currentSymbol);
  const filteredSymbols = popularSymbols.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.fullName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className="justify-start gap-2 font-mono"
          data-testid="button-symbol-selector"
        >
          {currentSymbolData ? (
            <>
              <span className="font-semibold">{currentSymbolData.name}</span>
              <span className={cn(
                "text-xs",
                currentSymbolData.change >= 0 ? "text-bullish" : "text-bearish"
              )}>
                {currentSymbolData.change >= 0 ? "+" : ""}{currentSymbolData.change}%
              </span>
            </>
          ) : (
            <span>Select Symbol</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search symbols..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-symbol-search"
            />
          </div>
        </div>
        <div className="px-3 py-2 border-b">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            <span>Popular Symbols</span>
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-2">
            {filteredSymbols.map((symbol) => (
              <button
                key={symbol.id}
                className={cn(
                  "w-full flex items-center justify-between p-2 rounded-md hover-elevate transition-colors",
                  currentSymbol === symbol.id && "bg-accent"
                )}
                onClick={() => {
                  onSymbolChange(symbol.id);
                  setOpen(false);
                }}
                data-testid={`symbol-${symbol.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-bold">
                    {symbol.name.split('/')[0].slice(0, 3)}
                  </div>
                  <div className="text-left">
                    <p className="font-mono font-medium text-sm">{symbol.name}</p>
                    <p className="text-xs text-muted-foreground">{symbol.fullName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">${symbol.price.toLocaleString()}</p>
                  <div className={cn(
                    "flex items-center justify-end gap-0.5 text-xs",
                    symbol.change >= 0 ? "text-bullish" : "text-bearish"
                  )}>
                    {symbol.change >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    <span>{symbol.change >= 0 ? "+" : ""}{symbol.change}%</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
