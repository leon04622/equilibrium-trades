import { Link } from "react-router-dom";
import { BookMarked, LineChart, Rocket, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoweredByHyperliquid } from "@/components/powered-by-hyperliquid";

/**
 * In-app documentation for users and external reviewers.
 * Canonical Markdown twin: `docs/EQUILIBRIUM_PLATFORM.md` at repo root.
 */
export default function Docs() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10 pb-24">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-primary">
              <BookMarked className="h-7 w-7" />
              <Badge variant="secondary">Docs</Badge>
              <PoweredByHyperliquid />
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Equilibrium Trading</h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
              Live execution, AI pattern scanning, cleaner chart context, and a calmer workflow for learning,
              scanning, and trading in one place.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What the platform is for</CardTitle>
          <CardDescription>The main parts of Equilibrium and how they work together.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Trading</strong> gives you live charts, order entry, position management,
            and order execution in one workspace.
          </p>
          <p>
            <strong className="text-foreground">AI Signals</strong> scans markets across multiple timeframes to surface
            developing and developed chart structures like wedges, flags, triangles, doubles, and head-and-shoulders.
          </p>
          <p>
            <strong className="text-foreground">Pattern Library</strong> helps you quickly check what a setup means if
            the scanner finds something you want to review before acting.
          </p>
          <p>
            <strong className="text-foreground">Portfolio</strong> is where you manage balances, deposits, transfers,
            and withdrawals without needing to leave the platform.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LineChart className="h-5 w-5 text-primary" />
            How Equilibrium reads charts
          </CardTitle>
          <CardDescription>Simple context behind the platform’s chart and scanner language.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Charts use <strong className="text-foreground">21</strong> and{" "}
            <strong className="text-foreground">200 SMMA</strong> as trend context. In simple terms, when the faster line
            is above the slower line, the platform describes a stronger bullish environment; when it is below, the
            environment is more bearish.
          </p>
          <p>
            The scanner is <strong className="text-foreground">geometry first</strong>. If a wedge, flag, triangle, or
            reversal pattern is structurally valid, it can still appear even if the moving-average context is mixed.
            That means the chart patterns are not hidden just because the trend is not perfectly aligned.
          </p>
          <p>
            Results are shown across multiple timeframes so you can compare short-term opportunities with slower, more
            established structures before making a decision.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Rocket className="h-5 w-5 text-primary" />
            Quick start
          </CardTitle>
          <CardDescription>Three steps for new users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-4 text-sm">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-xs">
                1
              </span>
              <div>
                <p className="font-medium text-foreground">Connect your wallet</p>
                <p className="text-muted-foreground mt-1">
                  Connect on the site header. On <Link className="text-primary underline" to="/portfolio">Portfolio</Link>
                  , move <strong>native USDC</strong> on <strong>Arbitrum One</strong> into your trading account using{" "}
                  <strong>Circle CCTP</strong>. Step-by-step pictures:{" "}
                  <Link className="text-primary underline" to="/guide/deposit">
                    Deposit guide
                  </Link>
                  . The deposit flow is a direct USDC messaging route rather than a swap-style bridge, and your progress
                  is remembered if you need to come back later.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-xs">
                2
              </span>
              <div>
                <p className="font-medium text-foreground">Approve builder fee &amp; trading session</p>
                <p className="text-muted-foreground mt-1">
                  Complete the one-time trading setup when prompted so the platform can route orders cleanly
                  and keep the trading workflow fast afterward.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-xs">
                3
              </span>
              <div>
                <p className="font-medium text-foreground">Fund margin &amp; open Trading</p>
                <p className="text-muted-foreground mt-1">
                  After CCTP completes and HyperCore credits USDC, use <strong>spot → perp</strong> in Portfolio only if
                  margin shows in spot. Open <Link className="text-primary underline" to="/trading">Trading</Link> for
                  execution and charts.
                </p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deposits — Circle CCTP to HyperCore</CardTitle>
          <CardDescription>A safer USDC deposit route designed for direct delivery into your trading environment.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">Route:</strong> USDC on Arbitrum → <strong>CCTP burn</strong> → attestation →{" "}
            <strong>mint on HyperEVM</strong> → <strong>forward to HyperCore</strong> (default: perp margin), following{" "}
            <a
              className="text-primary underline"
              href="https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore"
              target="_blank"
              rel="noopener noreferrer"
            >
              Circle’s HyperCore guide
            </a>
            . This is <strong>1:1 USDC</strong> messaging with <strong>no AMM slippage</strong>.
          </p>
          <p>
            <strong className="text-foreground">Why it matters:</strong> this route is designed to keep the transfer
            simple and explicit. It avoids the confusion of sending funds to random bridge addresses and keeps the user
            flow focused on direct USDC delivery.
          </p>
          <p>
            <strong className="text-foreground">Resilience:</strong> if you leave the page during a deposit, the platform
            can restore your progress so you can continue without starting the whole process again.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Platform principles
          </CardTitle>
          <CardDescription>What users should expect from the experience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            <strong className="text-foreground">Clarity first:</strong> the goal is to reduce clutter and show you what
            matters now, whether that is chart context, a developing pattern, or your current account state.
          </p>
          <p>
            <strong className="text-foreground">Learning while trading:</strong> Equilibrium is built so you can spot a
            pattern, jump to the library to review it, and return to the same workflow without losing context.
          </p>
          <p>
            <strong className="text-foreground">Educational, not prescriptive:</strong> AI signals and chart labels are
            meant to help you read structure faster. They are there to support judgment, not replace it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
