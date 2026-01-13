import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Info, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Pause,
  Play,
  Lock,
  Flame
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface HeatmapData {
  priceLevel: number;
  time: number;
  bidVolume: number;
  askVolume: number;
}

interface LargeOrder {
  price: number;
  size: number;
  side: "bid" | "ask";
  timestamp: number;
}

interface HeatmapMessage {
  type: string;
  coin: string;
  data: {
    heatmap: HeatmapData[][];
    largeOrders: LargeOrder[];
    currentPrice: number;
    timestamp: number;
  };
}

interface LiquidityHeatmapProps {
  coin: string;
  locked?: boolean;
  className?: string;
}

export function LiquidityHeatmap({ coin, locked = false, className }: LiquidityHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[][]>([]);
  const [largeOrders, setLargeOrders] = useState<LargeOrder[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch current ticker for price reference
  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 5000,
  });

  const currentTicker = tickers.find((t) => t.coin === coin);
  const tickerPrice = currentTicker ? parseFloat(currentTicker.markPx) : 0;

  // Connect to WebSocket when not locked
  useEffect(() => {
    if (locked) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/heatmap`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", coin }));
    };

    ws.onmessage = (event) => {
      if (isPaused) return;

      try {
        const message: HeatmapMessage = JSON.parse(event.data);
        if (message.type === "heatmap" && message.coin === coin) {
          setHeatmapData(message.data.heatmap);
          setLargeOrders(message.data.largeOrders);
          setCurrentPrice(message.data.currentPrice);
        }
      } catch (e) {
        console.error("Error parsing heatmap message:", e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [coin, isPaused, locked]);

  // Update subscription when coin changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !locked) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", coin }));
    }
  }, [coin, locked]);

  // Draw heatmap on canvas
  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || heatmapData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas with dark background
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    const columns = heatmapData.length;
    const rows = heatmapData[0]?.length || 0;

    if (rows === 0 || columns === 0) return;

    const cellWidth = width / columns;
    const cellHeight = height / rows;

    // Find max volume for color scaling
    let maxVolume = 0;
    for (const column of heatmapData) {
      for (const cell of column) {
        maxVolume = Math.max(maxVolume, cell.bidVolume, cell.askVolume);
      }
    }

    // Draw heatmap cells
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        const cell = heatmapData[col][row];
        const x = col * cellWidth;
        const y = (rows - row - 1) * cellHeight; // Flip Y axis

        // Calculate color intensity
        const bidIntensity = maxVolume > 0 ? cell.bidVolume / maxVolume : 0;
        const askIntensity = maxVolume > 0 ? cell.askVolume / maxVolume : 0;

        if (bidIntensity > askIntensity && bidIntensity > 0.05) {
          // Green for bids
          const alpha = Math.min(bidIntensity * 0.9 + 0.1, 1);
          ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
          ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
        } else if (askIntensity > bidIntensity && askIntensity > 0.05) {
          // Red for asks
          const alpha = Math.min(askIntensity * 0.9 + 0.1, 1);
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
        }
      }
    }

    // Draw current price line
    const displayPrice = currentPrice || tickerPrice;
    if (displayPrice > 0 && heatmapData[0]) {
      const priceLevels = heatmapData[0].map((d) => d.priceLevel);
      const minPrice = Math.min(...priceLevels);
      const maxPrice = Math.max(...priceLevels);

      if (displayPrice >= minPrice && displayPrice <= maxPrice) {
        const priceY = height - ((displayPrice - minPrice) / (maxPrice - minPrice)) * height;

        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width, priceY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`$${formatPrice(displayPrice)}`, 8, priceY - 8);
      }
    }

    // Draw large order markers
    if (heatmapData[0]) {
      const priceLevels = heatmapData[0].map((d) => d.priceLevel);
      const minPrice = Math.min(...priceLevels);
      const maxPrice = Math.max(...priceLevels);

      for (const order of largeOrders) {
        if (order.price >= minPrice && order.price <= maxPrice) {
          const orderY = height - ((order.price - minPrice) / (maxPrice - minPrice)) * height;
          const orderX = width - 15;

          ctx.fillStyle = order.side === "bid" ? "#22c55e" : "#ef4444";
          ctx.strokeStyle = order.side === "bid" ? "#16a34a" : "#dc2626";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(orderX, orderY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [heatmapData, largeOrders, currentPrice, tickerPrice]);

  // Redraw when data changes
  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        drawHeatmap();
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    return () => resizeObserver.disconnect();
  }, [drawHeatmap]);

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Locked state - show preview
  if (locked) {
    return (
      <Card className={cn("overflow-hidden", className)} data-testid="liquidity-heatmap">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Flame className="h-4 w-4 text-warning" />
              Liquidity Heatmap
            </CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Elite Feature
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative h-64">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">Unlock Bookmap-style Heatmap</p>
            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[200px]">
              See real-time order flow and identify where institutional orders are placed
            </p>
            <Link href="/pricing">
              <Button size="sm" data-testid="button-upgrade-heatmap">
                Upgrade to Elite
              </Button>
            </Link>
          </div>
          
          {/* Blurred preview background */}
          <div className="absolute inset-0 blur-sm pointer-events-none bg-gradient-to-b from-bullish/20 via-transparent to-bearish/20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background", className)} data-testid="liquidity-heatmap">
      {/* Header Controls */}
      <div className="flex items-center justify-between gap-4 p-3 border-b">
        <div className="flex items-center gap-2">
          <Badge
            variant={wsConnected ? "default" : "destructive"}
            className="text-xs"
          >
            <Activity className="h-3 w-3 mr-1" />
            {wsConnected ? "Live" : "Connecting..."}
          </Badge>
          <span className="text-sm font-semibold">{coin}/USDC Depth</span>
          {(currentPrice || tickerPrice) > 0 && (
            <span className="text-sm font-mono text-muted-foreground">
              ${formatPrice(currentPrice || tickerPrice)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsPaused(!isPaused)}
            data-testid="button-pause-heatmap"
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Heatmap Canvas */}
        <div className="flex-1 relative bg-black/50">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            data-testid="canvas-heatmap"
          />
          
          {!wsConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">Connecting to heatmap feed...</p>
              </div>
            </div>
          )}

          {heatmapData.length === 0 && wsConnected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">Building heatmap data...</p>
                <p className="text-xs text-muted-foreground mt-1">This may take 15-30 seconds</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Large Orders */}
        <div className="w-56 xl:w-64 border-l flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Whale Orders
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Large orders detected</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {largeOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Scanning for whale activity...</p>
                </div>
              ) : (
                largeOrders.slice().reverse().map((order, i) => (
                  <div
                    key={`${order.timestamp}-${i}`}
                    className={cn(
                      "p-2 rounded-md text-xs",
                      order.side === "bid" ? "bg-bullish/10 border border-bullish/20" : "bg-bearish/10 border border-bearish/20"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {order.side === "bid" ? (
                          <TrendingUp className="h-3 w-3 text-bullish" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-bearish" />
                        )}
                        <span className="font-mono">${formatPrice(order.price)}</span>
                      </div>
                      <span className={cn(
                        "font-mono font-semibold",
                        order.side === "bid" ? "text-bullish" : "text-bearish"
                      )}>
                        {order.size.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatTime(order.timestamp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Legend */}
          <div className="p-3 border-t space-y-2">
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-3 w-3 rounded-sm bg-bullish/60" />
              <span className="text-muted-foreground">Bid Liquidity (Buyers)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-3 w-3 rounded-sm bg-bearish/60" />
              <span className="text-muted-foreground">Ask Liquidity (Sellers)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-3 w-3 rounded-full bg-warning" />
              <span className="text-muted-foreground">Current Price</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
