import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function IllustrationPrepare({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 200"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="8" y="8" width="424" height="184" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <circle cx="100" cy="100" r="44" fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary) / 0.35)" />
      <text x="100" y="108" textAnchor="middle" className="fill-primary text-[22px] font-bold font-sans">
        USDC
      </text>
      <text x="230" y="88" textAnchor="middle" className="fill-muted-foreground text-[13px] font-sans">
        Native on
      </text>
      <text x="230" y="112" textAnchor="middle" className="fill-foreground text-[15px] font-semibold font-sans">
        Arbitrum One
      </text>
      <text x="230" y="136" textAnchor="middle" className="fill-muted-foreground text-[12px] font-mono">
        Chain 42161
      </text>
      <rect x="320" y="72" width="96" height="56" rx="8" fill="hsl(var(--muted) / 0.5)" stroke="hsl(var(--border))" />
      <text x="368" y="108" textAnchor="middle" className="fill-foreground text-[13px] font-sans">
        ETH gas
      </text>
    </svg>
  );
}

function IllustrationWallets({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="8" y="8" width="424" height="184" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <rect x="32" y="36" width="376" height="48" rx="8" fill="hsl(var(--muted) / 0.35)" stroke="hsl(var(--border))" />
      <text x="220" y="68" textAnchor="middle" className="fill-foreground text-[14px] font-sans">
        equilibrium-trading.xyz
      </text>
      <rect x="160" y="108" width="120" height="40" rx="8" fill="hsl(var(--primary))" />
      <text x="220" y="134" textAnchor="middle" className="fill-primary-foreground text-[14px] font-semibold font-sans">
        Connect
      </text>
      <text x="220" y="178" textAnchor="middle" className="fill-muted-foreground text-[12px] font-sans">
        Choose Rabby or MetaMask — then approve Arbitrum One
      </text>
    </svg>
  );
}

function IllustrationDepositPath({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="8" y="8" width="424" height="184" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <rect x="28" y="72" width="100" height="64" rx="10" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary) / 0.4)" />
      <text x="78" y="112" textAnchor="middle" className="fill-foreground text-[12px] font-sans">
        USDC
      </text>
      <text x="78" y="128" textAnchor="middle" className="fill-muted-foreground text-[10px] font-sans">
        Arbitrum
      </text>
      <path
        d="M138 104 H 200"
        stroke="hsl(var(--primary))"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <polygon points="208,104 198,98 198,110" fill="hsl(var(--primary))" />
      <text x="248" y="96" textAnchor="middle" className="fill-muted-foreground text-[11px] font-sans">
        Circle CCTP
      </text>
      <text x="248" y="118" textAnchor="middle" className="fill-muted-foreground text-[10px] font-sans">
        1:1 USDC route
      </text>
      <rect x="308" y="72" width="104" height="64" rx="10" fill="hsl(var(--muted) / 0.45)" stroke="hsl(var(--border))" />
      <text x="360" y="112" textAnchor="middle" className="fill-foreground text-[11px] font-sans">
        Trading
      </text>
      <text x="360" y="128" textAnchor="middle" className="fill-foreground text-[11px] font-sans">
        account
      </text>
    </svg>
  );
}

function IllustrationSpotPerp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 200" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="8" y="8" width="424" height="184" rx="16" fill="hsl(var(--card))" stroke="hsl(var(--border))" />
      <rect x="48" y="64" width="120" height="72" rx="10" fill="hsl(var(--muted) / 0.4)" stroke="hsl(var(--border))" />
      <text x="108" y="108" textAnchor="middle" className="fill-foreground text-[13px] font-sans">
        Spot USDC
      </text>
      <path d="M188 100 H 252" stroke="hsl(var(--primary))" strokeWidth="3" fill="none" strokeLinecap="round" />
      <polygon points="260,100 250,94 250,106" fill="hsl(var(--primary))" />
      <rect x="272" y="64" width="120" height="72" rx="10" fill="hsl(var(--primary) / 0.12)" stroke="hsl(var(--primary) / 0.35)" />
      <text x="332" y="108" textAnchor="middle" className="fill-foreground text-[13px] font-sans">
        Perp margin
      </text>
      <text x="220" y="168" textAnchor="middle" className="fill-muted-foreground text-[11px] font-sans">
        Only if Portfolio shows balance in spot but you need margin
      </text>
    </svg>
  );
}

export default function DepositGuide() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10 pb-24">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Guide</Badge>
          <span className="text-xs text-muted-foreground">Pictures + steps — no video required</span>
        </div>
        <h1 className="text-3xl font-bold font-display tracking-tight">Deposit funds to your account</h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-2xl leading-relaxed">
          Use <strong className="text-foreground">Rabby</strong> or <strong className="text-foreground">MetaMask</strong> in
          your browser, then move <strong className="text-foreground">native USDC on Arbitrum One</strong> into your
          trading account through <strong className="text-foreground">Portfolio → Deposit</strong> on Equilibrium.
        </p>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">1. Before you start</CardTitle>
          <CardDescription>Check these three things so the deposit flow goes smoothly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <IllustrationPrepare className="w-full max-w-lg mx-auto drop-shadow-sm" />
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              <strong className="text-foreground">Native USDC on Arbitrum One</strong> (chain ID <code className="text-xs bg-muted px-1 rounded">42161</code>
              ). If your USDC is on another network, move it to Arbitrum first (exchange withdrawal or bridge).
            </li>
            <li>
              <strong className="text-foreground">A little ETH on Arbitrum</strong> for gas when you approve USDC and
              confirm transactions.
            </li>
            <li>
              <strong className="text-foreground">Rabby or MetaMask</strong> installed in the same browser you use for
              Equilibrium.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Connect your wallet (Rabby or MetaMask)</CardTitle>
          <CardDescription>Same steps for either wallet — pick the one you use.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <IllustrationWallets className="w-full max-w-lg mx-auto drop-shadow-sm" />
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <div>
              <p className="font-medium text-foreground mb-2">Rabby</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Install the Rabby extension from the official source.</li>
                <li>Open Equilibrium and click <strong className="text-foreground">Connect</strong> in the header.</li>
                <li>Choose <strong className="text-foreground">Rabby</strong> and approve the connection.</li>
                <li>If prompted, switch to <strong className="text-foreground">Arbitrum One</strong>.</li>
              </ul>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-foreground mb-2">MetaMask</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Install MetaMask and unlock your wallet.</li>
                <li>On Equilibrium, click <strong className="text-foreground">Connect</strong> → <strong className="text-foreground">MetaMask</strong>.</li>
                <li>Approve the connection and <strong className="text-foreground">Arbitrum One</strong> if the site asks.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Deposit on Equilibrium</CardTitle>
          <CardDescription>
            The app walks you through a Circle <strong className="text-foreground">CCTP</strong> route (1:1 USDC, not a
            swap-style bridge).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <IllustrationDepositPath className="w-full max-w-lg mx-auto drop-shadow-sm" />
          <div className="rounded-lg border border-border/80 bg-muted/25 p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
            <p>
              <strong className="text-foreground">Verified against public docs:</strong> this in-app path follows Circle’s{" "}
              <a
                className="text-primary underline font-medium"
                href="https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore"
                target="_blank"
                rel="noopener noreferrer"
              >
                Transfer USDC from Arbitrum to HyperCore
              </a>{" "}
              flow (CCTP from Arbitrum, destination domain for HyperEVM, forwarder hook into HyperCore). That matches how
              Equilibrium’s deposit code uses <code className="text-[10px] bg-muted px-1 rounded">batchDepositForBurnWithAuth</code>{" "}
              and forward hook data — not a swap pool.
            </p>
            <p>
              <strong className="text-foreground">Other route (not this button):</strong>{" "}
              <a
                className="text-primary underline font-medium"
                href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hyperliquid Bridge2
              </a>{" "}
              documents sending <strong className="text-foreground">native USDC on Arbitrum</strong> directly to their bridge
              contract (they state a <strong className="text-foreground">5 USDC</strong> minimum on mainnet). That is a
              separate, manual transfer — Equilibrium’s <strong className="text-foreground">Portfolio → Deposit</strong>{" "}
              uses the CCTP route above.
            </p>
            <p>
              Circle’s guide notes a small <strong className="text-foreground">forwarding fee</strong> to HyperCore (quoted
              live in the deposit dialog). Amounts below the app’s minimum are not credited — use the limit shown in the UI.
            </p>
          </div>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              Go to{" "}
              <Link className="text-primary font-medium underline underline-offset-2" to="/portfolio">
                Portfolio
              </Link>
              .
            </li>
            <li>Open the <strong className="text-foreground">Deposit</strong> dialog for USDC.</li>
            <li>Confirm you are on <strong className="text-foreground">Arbitrum One</strong>; switch if the app asks.</li>
            <li>Enter the amount (respect any minimum shown). Leave room for fees and any first-time account credit noted in the dialog.</li>
            <li>Approve <strong className="text-foreground">USDC</strong> in your wallet when asked, then confirm each step the UI describes (burn, attestation, mint/forward).</li>
            <li>
              If you leave mid-way, you can usually <strong className="text-foreground">resume</strong> — progress is saved
              for your account.
            </li>
          </ol>
          <p className="text-xs text-muted-foreground border border-border/80 rounded-lg p-3 bg-muted/30">
            More detail: see{" "}
            <Link className="text-primary underline" to="/docs">
              Docs
            </Link>{" "}
            → Deposits (Circle CCTP to HyperCore).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4. After your balance updates</CardTitle>
          <CardDescription>Optional move, then open Trading.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <IllustrationSpotPerp className="w-full max-w-lg mx-auto drop-shadow-sm" />
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              If USDC sits in <strong className="text-foreground">spot</strong> but you need <strong className="text-foreground">perp margin</strong>, use the spot → perp transfer in Portfolio only when that matches what you see.
            </li>
            <li>
              Open{" "}
              <Link className="text-primary font-medium underline underline-offset-2" to="/trading">
                Trading
              </Link>{" "}
              for charts and orders.
            </li>
          </ul>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Crypto trading involves risk. This guide is educational, not financial advice.
      </p>
    </div>
  );
}
