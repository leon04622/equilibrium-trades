import { Flame, Lock, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LiquidityHeatmap } from "@/components/liquidity-heatmap";
import { Link } from "wouter";

export default function Heatmap() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-8 w-8 text-warning" />
          <h1 className="text-3xl font-display font-bold">Liquidity Heatmap</h1>
          <Badge variant="outline" className="ml-2">
            <Lock className="h-3 w-3 mr-1" />
            Pro Feature
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Visualize where large orders are sitting in the order book
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LiquidityHeatmap currentPrice={98432} locked={true} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">What is a Liquidity Heatmap?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A liquidity heatmap shows you where large buy and sell orders are placed 
                in the order book. This helps you identify:
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-bullish mt-0.5" />
                  <span><strong>Support levels</strong> - Large buy orders that may prevent price from falling</span>
                </li>
                <li className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-bearish mt-0.5" />
                  <span><strong>Resistance levels</strong> - Large sell orders that may prevent price from rising</span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-primary mt-0.5" />
                  <span><strong>Institutional activity</strong> - Spot where big players are positioned</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Unlock Liquidity Insights</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get access to real-time liquidity data and gain an edge in your trading.
              </p>
              <Link href="/pricing">
                <Button className="w-full" data-testid="button-upgrade-heatmap-page">
                  Upgrade to Pro
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-display">Pro Features Include</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Real-time order book visualization
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Historical liquidity analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Large order alerts
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Support/resistance auto-detection
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Multiple symbol tracking
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
