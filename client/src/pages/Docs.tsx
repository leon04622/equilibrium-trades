import { Link } from "react-router-dom";
import { BookMarked, LineChart, Rocket, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/**
 * In-app documentation for users and external reviewers (e.g. Hyperliquid).
 * Canonical Markdown twin: `docs/EQUILIBRIUM_PLATFORM.md` at repo root.
 */
export default function Docs() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10 pb-24">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <BookMarked className="h-7 w-7" />
              <Badge variant="secondary">Docs</Badge>
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Equilibrium Trading</h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
              Hyperliquid L1 execution, SMMA trend context, and a geometry-first pattern scanner. Static reference for
              onboarding, exchange review, and platform trust.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LineChart className="h-5 w-5 text-primary" />
            Strategy — 21 / 200 SMMA (trend-first)
          </CardTitle>
          <CardDescription>
            How we read trend and how it relates to poles and flags.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            Charts plot <strong className="text-foreground">21-period</strong> and{" "}
            <strong className="text-foreground">200-period SMMA</strong> (smoothed moving averages), consistent
            with Hyperliquid’s methodology. Trend-first context: when 21 is above 200, we describe a{" "}
            <strong className="text-foreground">bullish bias</strong>; when below, a{" "}
            <strong className="text-foreground">bearish bias</strong>. Price relative to both lines informs
            educational copy on pattern cards.
          </p>
          <p>
            <strong className="text-foreground">Impulse poles</strong> are sharp directional legs — the engine
            measures a strong move that establishes momentum before price pauses.
          </p>
          <p>
            <strong className="text-foreground">Consolidation flags</strong> are tight counter-trend channels
            after that pole (e.g. bull flag: downward-sloping pause after an upward pole). Breakout states range
            from forming to confirmed.
          </p>
          <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            Scanner rule: <strong className="text-foreground">geometry is not vetoed by SMMA.</strong> Bearish
            structures in bullish regimes (and the reverse) still appear when OHLC rules validate; SMMA is
            advisory on the card, not a hide filter.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Technical specs — scanner</CardTitle>
          <CardDescription>Markets, timeframes, and pattern coverage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-2 leading-relaxed">
            <li>
              <strong className="text-foreground">Universe:</strong> top{" "}
              <strong className="text-foreground">50</strong> Hyperliquid perps by 24h notional volume, plus{" "}
              <strong className="text-foreground">PAXG</strong> (gold proxy) when listed.
            </li>
            <li>
              <strong className="text-foreground">Timeframes:</strong> multi-TF pipeline includes{" "}
              <code className="text-xs bg-muted px-1 rounded">1m</code>,{" "}
              <code className="text-xs bg-muted px-1 rounded">5m</code>,{" "}
              <code className="text-xs bg-muted px-1 rounded">1h</code>, and{" "}
              <code className="text-xs bg-muted px-1 rounded">4h</code> among others (15m, 30m, 2h, 1d).
            </li>
            <li>
              <strong className="text-foreground">Lookback:</strong> deep windows (e.g. 1h / 4h) request up to{" "}
              <strong className="text-foreground">400</strong> bars for macro poles; a minimum of{" "}
              <strong className="text-foreground">200</strong> bars is required before a pattern is emitted.
            </li>
            <li>
              <strong className="text-foreground">Pattern library:</strong> wedges, triangles, double tops/bottoms,
              bull/bear flags (incl. volume-aware variants), channels, head &amp; shoulders / inverse H&amp;S, and
              Apex pole+flag geometry — evaluated across the full universe above.
            </li>
          </ul>
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
                  , move <strong>native USDC</strong> on <strong>Arbitrum One</strong> into <strong>HyperCore</strong> using{" "}
                  <strong>Circle CCTP</strong> — an institutional, <strong>zero-slippage</strong> burn/mint path (no pool
                  trading). The app signs <strong>EIP-3009 ReceiveWithAuthorization</strong> and calls{" "}
                  <code className="text-xs bg-muted px-1 rounded">batchDepositForBurnWithAuth</code> on a server-configured{" "}
                  <strong>CctpExtension</strong>; contract addresses are never hardcoded in the client bundle. Bridge step
                  progress is saved to your CRM profile so you can resume after refresh.
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
                  Complete Hyperliquid <strong>approveBuilderFee</strong> and agent approval so routed orders
                  include the platform builder address.
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
          <CardDescription>Official cross-chain USDC messaging — not a custom “look-alike” bridge recipient.</CardDescription>
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
            <strong className="text-foreground">Configuration:</strong> the server exposes{" "}
            <code className="text-xs bg-muted px-1 rounded">GET /api/cctp/deposit-config</code> and{" "}
            <code className="text-xs bg-muted px-1 rounded">GET /api/cctp/fees</code> (Iris fee quote). Env vars:{" "}
            <code className="text-xs bg-muted px-1 rounded">CCTP_EXTENSION_ADDRESS</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">CCTP_USDC_ADDRESS</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">CCTP_FORWARDER_ADDRESS</code>, domains, etc. — see{" "}
            <code className="text-xs bg-muted px-1 rounded">.env.example</code>.
          </p>
          <p>
            <strong className="text-foreground">Progress memory:</strong> each step is persisted to MongoDB via{" "}
            <code className="text-xs bg-muted px-1 rounded">POST /api/user/cctp-bridge-progress</code> and returned in{" "}
            <code className="text-xs bg-muted px-1 rounded">GET /api/user/sync</code> so the UI can show where you left off.
            <strong className="text-foreground"> Pro / Mentor</strong> grants in CRM are not cleared by these updates — manual
            Pro overrides are preserved when syncing from Postgres.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Identity &amp; builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm font-mono text-xs break-all">
          <p>
            <span className="text-muted-foreground font-sans text-sm">Admin wallet: </span>
            0x115560812df8e7515eecc957b6796531e936edd9
          </p>
          <p>
            <span className="text-muted-foreground font-sans text-sm">Builder code recipient: </span>
            0xad9be64fd7a35d99a138b87cb212baefbcdcf045
          </p>
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground text-center">
        Markdown export: <code className="bg-muted px-1 rounded">docs/EQUILIBRIUM_PLATFORM.md</code>
      </p>
    </div>
  );
}
