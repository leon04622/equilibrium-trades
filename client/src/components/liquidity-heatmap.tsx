import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { 
  Info, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Pause,
  Play,
  Lock,
  Flame,
  ZoomIn,
  ZoomOut,
  Crosshair
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

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

interface OrderBookLevel {
  px: string;
  sz: string;
  n: number;
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
  const [zoom, setZoom] = useState([50]);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [scrollPosition, setScrollPosition] = useState(100); // 100 = live (rightmost), 0 = oldest
  const [historyFrames, setHistoryFrames] = useState<HeatmapData[][][]>([]);
  const maxHistoryFrames = 300; // Store up to 5 minutes of history at 1 frame/sec
  const isLive = scrollPosition >= 95;
  const wsRef = useRef<WebSocket | null>(null);

  // Get the heatmap data to display based on scroll position
  const displayHeatmap = (() => {
    if (isLive || historyFrames.length === 0) {
      return heatmapData;
    }
    // Map scroll position (0-94) to history frame index
    const frameIndex = Math.floor((scrollPosition / 95) * historyFrames.length);
    return historyFrames[Math.min(frameIndex, historyFrames.length - 1)] || heatmapData;
  })();

  // Fetch current ticker and order book
  const { data: tickers = [] } = useQuery<any[]>({
    queryKey: ["/api/hyperliquid/tickers"],
    refetchInterval: 5000,
  });

  const { data: orderBook } = useQuery<{ coin: string; levels: OrderBookLevel[][] }>({
    queryKey: ["/api/hyperliquid/orderbook", coin],
    refetchInterval: 1000,
  });

  const currentTicker = tickers.find((t) => t.coin === coin);
  const tickerPrice = currentTicker ? parseFloat(currentTicker.markPx) : 0;

  const bids = orderBook?.levels?.[0] || [];
  const asks = orderBook?.levels?.[1] || [];

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
          // Always store history frames for scrolling
          setHistoryFrames((prev: HeatmapData[][][]) => {
            const newFrames: HeatmapData[][][] = [...prev, message.data.heatmap];
            if (newFrames.length > maxHistoryFrames) {
              return newFrames.slice(-maxHistoryFrames);
            }
            return newFrames;
          });
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

  // Draw heatmap on canvas - Bookmap style
  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Dark background like Bookmap
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, height);

    if (displayHeatmap.length === 0) {
      // Draw placeholder gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.1)");
      gradient.addColorStop(0.5, "rgba(100, 100, 100, 0.05)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const columns = displayHeatmap.length;
    const rows = displayHeatmap[0]?.length || 0;

    if (rows === 0 || columns === 0) return;

    const cellWidth = width / columns;
    const cellHeight = height / rows;

    // Find max volume for color scaling
    let maxVolume = 0;
    for (const column of displayHeatmap) {
      for (const cell of column) {
        maxVolume = Math.max(maxVolume, cell.bidVolume, cell.askVolume);
      }
    }

    // Bookmap-style color scheme: blue -> yellow -> red for intensity
    const getBookmapColor = (intensity: number, side: "bid" | "ask") => {
      if (intensity < 0.1) return null;
      
      // Scale intensity for visual effect
      const scaledIntensity = Math.pow(intensity, 0.7);
      
      if (side === "bid") {
        // Green gradient for bids
        if (scaledIntensity < 0.3) {
          return `rgba(0, 100, 50, ${scaledIntensity * 2})`;
        } else if (scaledIntensity < 0.6) {
          return `rgba(34, 197, 94, ${scaledIntensity * 1.5})`;
        } else {
          return `rgba(74, 222, 128, ${Math.min(1, scaledIntensity * 1.2)})`;
        }
      } else {
        // Red gradient for asks
        if (scaledIntensity < 0.3) {
          return `rgba(100, 30, 30, ${scaledIntensity * 2})`;
        } else if (scaledIntensity < 0.6) {
          return `rgba(239, 68, 68, ${scaledIntensity * 1.5})`;
        } else {
          return `rgba(248, 113, 113, ${Math.min(1, scaledIntensity * 1.2)})`;
        }
      }
    };

    // Draw heatmap cells
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        const cell = displayHeatmap[col][row];
        const x = col * cellWidth;
        const y = (rows - row - 1) * cellHeight;

        const bidIntensity = maxVolume > 0 ? cell.bidVolume / maxVolume : 0;
        const askIntensity = maxVolume > 0 ? cell.askVolume / maxVolume : 0;

        if (bidIntensity > askIntensity) {
          const color = getBookmapColor(bidIntensity, "bid");
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
          }
        } else if (askIntensity > bidIntensity) {
          const color = getBookmapColor(askIntensity, "ask");
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
          }
        }
      }
    }

    // Draw volume bubbles (dots) for recent trades - Bookmap style (only show when live)
    if (isLive) {
    for (const order of largeOrders) {
      if (displayHeatmap[0]) {
        const priceLevels = displayHeatmap[0].map((d) => d.priceLevel);
        const minPrice = Math.min(...priceLevels);
        const maxPrice = Math.max(...priceLevels);

        if (order.price >= minPrice && order.price <= maxPrice) {
          const orderY = height - ((order.price - minPrice) / (maxPrice - minPrice)) * height;
          const timeFraction = (Date.now() - order.timestamp) / 60000; // Last minute
          const orderX = width - (timeFraction * width * 0.8);

          if (orderX > 0 && orderX < width) {
            // Size based on order size
            const bubbleSize = Math.min(20, Math.max(4, Math.sqrt(order.size) * 3));
            
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = order.side === "bid" ? "#22c55e" : "#ef4444";
            ctx.beginPath();
            ctx.arc(orderX, orderY, bubbleSize, 0, Math.PI * 2);
            ctx.fill();
            
            // White border
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    } // end if isLive

    // Draw BBO (Best Bid/Offer) lines
    const displayPrice = currentPrice || tickerPrice;
    if (displayPrice > 0 && displayHeatmap[0]) {
      const priceLevels = displayHeatmap[0].map((d) => d.priceLevel);
      const minPrice = Math.min(...priceLevels);
      const maxPrice = Math.max(...priceLevels);

      if (displayPrice >= minPrice && displayPrice <= maxPrice) {
        const priceY = height - ((displayPrice - minPrice) / (maxPrice - minPrice)) * height;

        // Current price line (yellow like Bookmap)
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, priceY);
        ctx.lineTo(width, priceY);
        ctx.stroke();

        // Price label box
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(width - 80, priceY - 10, 80, 20);
        ctx.fillStyle = "#000";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`$${formatPrice(displayPrice)}`, width - 40, priceY + 4);
      }
    }

    // Draw crosshair on hover
    if (showCrosshair && mousePos && mousePos.x > 0 && mousePos.y > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(width, mousePos.y);
      ctx.stroke();
      
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height);
      ctx.stroke();
      
      ctx.setLineDash([]);
    }

    // Draw subtle grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const y = (height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [displayHeatmap, largeOrders, currentPrice, tickerPrice, showCrosshair, mousePos, isLive]);

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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

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

  // Calculate max size for order book depth bars
  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.sz) || 0), 1);
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.sz) || 0), 1);

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
            <Link to="/">
              <Button size="sm" data-testid="button-upgrade-heatmap">
                Upgrade to Elite
              </Button>
            </Link>
          </div>
          
          <div className="absolute inset-0 blur-sm pointer-events-none bg-gradient-to-b from-bullish/20 via-transparent to-bearish/20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-[#0d0d0d]", className)} data-testid="liquidity-heatmap">
      {/* Bookmap-style Header Toolbar */}
      <div className="flex items-center justify-between gap-4 px-3 py-2 bg-[#1a1a1a] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <Badge
            variant={wsConnected ? (isLive ? "default" : "secondary") : "destructive"}
            className="text-xs"
          >
            <Activity className="h-3 w-3 mr-1" />
            {wsConnected ? (isLive ? "LIVE" : "HISTORY") : "Connecting..."}
          </Badge>
          <span className="text-sm font-semibold text-white">{coin}/USDC</span>
          {(currentPrice || tickerPrice) > 0 && (
            <span className="text-sm font-mono text-yellow-400">
              ${formatPrice(currentPrice || tickerPrice)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              showCrosshair && "bg-white/10"
            )}
            onClick={() => setShowCrosshair(!showCrosshair)}
            data-testid="button-crosshair"
          >
            <Crosshair className="h-4 w-4 text-white/70" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsPaused(!isPaused)}
            data-testid="button-pause-heatmap"
          >
            {isPaused ? <Play className="h-4 w-4 text-white/70" /> : <Pause className="h-4 w-4 text-white/70" />}
          </Button>
          <div className="flex items-center gap-1 ml-2">
            <ZoomOut className="h-3 w-3 text-white/50" />
            <Slider
              value={zoom}
              onValueChange={setZoom}
              min={20}
              max={100}
              className="w-20"
            />
            <ZoomIn className="h-3 w-3 text-white/50" />
          </div>
        </div>
      </div>

      {/* Timeline scrollbar */}
      <div className="h-6 bg-[#111] border-b border-[#333] flex items-center gap-2 px-3">
        <span className="text-[10px] text-white/40">Timeline ({historyFrames.length} frames)</span>
        <input
          type="range"
          min={0}
          max={100}
          value={scrollPosition}
          onChange={(e) => setScrollPosition(parseInt(e.target.value))}
          className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
          data-testid="slider-timeline"
        />
        <span className={cn(
          "text-[10px] min-w-[50px] text-right font-mono",
          isLive ? "text-yellow-400" : "text-white/60"
        )}>
          {isLive ? "LIVE" : `${Math.round((100 - scrollPosition) / 100 * 5)}m ago`}
        </span>
        {!isLive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-yellow-400"
            onClick={() => setScrollPosition(100)}
            data-testid="button-go-live"
          >
            Go Live
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Heatmap Canvas */}
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            data-testid="canvas-heatmap"
          />
          
          {!wsConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0d0d0d]/90">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-white/30 mb-2 animate-pulse" />
                <p className="text-sm text-white/50">Connecting to heatmap feed...</p>
              </div>
            </div>
          )}

          {heatmapData.length === 0 && wsConnected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Activity className="h-12 w-12 mx-auto text-white/30 mb-2 animate-pulse" />
                <p className="text-sm text-white/50">Building heatmap data...</p>
                <p className="text-xs text-white/30 mt-1">This may take 15-30 seconds</p>
              </div>
            </div>
          )}
        </div>

        {/* Current Order Book (COB) Column - Bookmap style */}
        <div className="w-28 bg-[#111] border-l border-[#333] flex flex-col">
          <div className="p-1 text-center text-[10px] text-white/50 border-b border-[#333]">
            ORDER BOOK
          </div>
          
          {/* Asks (top) */}
          <div className="flex-1 flex flex-col-reverse overflow-hidden">
            {asks.slice(0, 12).map((ask, i) => {
              const size = parseFloat(ask.sz);
              const widthPct = (size / maxAskSize) * 100;
              return (
                <div key={`ask-${i}`} className="relative h-5 flex items-center px-1">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-red-500/30"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="relative text-[10px] font-mono text-red-400 flex-1 text-right">
                    {formatPrice(parseFloat(ask.px))}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Spread indicator */}
          <div className="py-1 px-2 bg-yellow-500/20 text-center">
            <span className="text-[10px] font-mono text-yellow-400">
              {formatPrice(currentPrice || tickerPrice)}
            </span>
          </div>
          
          {/* Bids (bottom) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {bids.slice(0, 12).map((bid, i) => {
              const size = parseFloat(bid.sz);
              const widthPct = (size / maxBidSize) * 100;
              return (
                <div key={`bid-${i}`} className="relative h-5 flex items-center px-1">
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-green-500/30"
                    style={{ width: `${widthPct}%` }}
                  />
                  <span className="relative text-[10px] font-mono text-green-400 flex-1 text-right">
                    {formatPrice(parseFloat(bid.px))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar - Large Orders */}
        <div className="w-52 bg-[#0d0d0d] border-l border-[#333] flex flex-col">
          <div className="p-2 border-b border-[#333]">
            <h3 className="font-semibold text-xs flex items-center gap-2 text-white">
              <AlertTriangle className="h-3 w-3 text-yellow-400" />
              Whale Activity
            </h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {largeOrders.length === 0 ? (
                <div className="text-center py-6 text-white/30">
                  <Info className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-[10px]">Scanning for whales...</p>
                </div>
              ) : (
                largeOrders.slice().reverse().slice(0, 10).map((order, i) => (
                  <div
                    key={`${order.timestamp}-${i}`}
                    className={cn(
                      "p-2 rounded text-xs",
                      order.side === "bid" ? "bg-green-500/10 border-l-2 border-green-500" : "bg-red-500/10 border-l-2 border-red-500"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {order.side === "bid" ? (
                          <TrendingUp className="h-3 w-3 text-green-400" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-400" />
                        )}
                        <span className="font-mono text-white/80">${formatPrice(order.price)}</span>
                      </div>
                      <span className={cn(
                        "font-mono font-semibold",
                        order.side === "bid" ? "text-green-400" : "text-red-400"
                      )}>
                        {order.size.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {formatTime(order.timestamp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Legend */}
          <div className="p-2 border-t border-[#333] space-y-1">
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>Bid (Buy) Volume</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span>Ask (Sell) Volume</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/60">
              <div className="h-2 w-4 bg-yellow-500" />
              <span>Current Price</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
