import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Smartphone, CheckCircle2 } from "lucide-react";
import {
  RABBY_ANDROID_STORE,
  RABBY_IOS_STORE,
  copyTextForUser,
  currentSiteUrlForWalletHandoff,
  isAndroid,
  isIOS,
  openRabbyMobileApp,
} from "@/lib/wallet-mobile-rabby";

type Props = {
  onOpenRabby?: () => void;
  /** When true, user is already inside Rabby/another wallet browser — show connect CTA only. */
  inWalletBrowser?: boolean;
  walletBrowserLabel?: string;
  onConnectInBrowser?: () => void;
  isConnecting?: boolean;
};

export function RabbyMobileConnectHelp({
  onOpenRabby,
  inWalletBrowser,
  walletBrowserLabel,
  onConnectInBrowser,
  isConnecting,
}: Props) {
  const [copied, setCopied] = useState(false);
  const siteUrl = typeof window !== "undefined" ? currentSiteUrlForWalletHandoff() : "";

  const handleCopy = async () => {
    const ok = await copyTextForUser(siteUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  if (inWalletBrowser) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
        <p className="text-xs font-medium text-foreground">
          {walletBrowserLabel ?? "Wallet"} browser detected
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tap below and approve the connection in your wallet. If you have multiple accounts, pick the
          one you want to trade with.
        </p>
        {onConnectInBrowser ? (
          <Button
            className="w-full h-12"
            onClick={onConnectInBrowser}
            disabled={isConnecting}
            data-testid="button-connect-rabby-in-app"
          >
            {isConnecting ? "Connecting…" : `Connect ${walletBrowserLabel ?? "wallet"}`}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3 text-left">
      <p className="text-xs font-medium text-foreground flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-amber-600" />
        Rabby on phone — use the in-app browser
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Safari and Chrome on your phone cannot use the Rabby extension. Open this site{" "}
        <strong>inside the Rabby app</strong> (DApps → paste URL), then connect.
      </p>
      <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
        <li>Install Rabby if you have not already.</li>
        <li>Copy this page link (button below).</li>
        <li>Open Rabby → <strong>DApps</strong> → paste the link → go.</li>
        <li>On Equilibrium, tap <strong>Connect Rabby</strong>.</li>
      </ol>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 gap-2"
          onClick={() => void handleCopy()}
          data-testid="button-copy-site-for-rabby"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Link copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy site link for Rabby
            </>
          )}
        </Button>
        <Button
          type="button"
          className="w-full h-11 gap-2"
          onClick={() => {
            onOpenRabby?.();
            openRabbyMobileApp(siteUrl);
          }}
          data-testid="button-launch-rabby-app"
        >
          <Smartphone className="h-4 w-4" />
          Open Rabby app
        </Button>
        {(isIOS() || isAndroid()) && (
          <Button
            type="button"
            variant="ghost"
            className="w-full h-10 text-xs"
            onClick={() =>
              window.open(isIOS() ? RABBY_IOS_STORE : RABBY_ANDROID_STORE, "_blank")
            }
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Get Rabby from app store
          </Button>
        )}
      </div>
    </div>
  );
}
