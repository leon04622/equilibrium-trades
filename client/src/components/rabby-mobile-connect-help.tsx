import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, CheckCircle2, Wallet } from "lucide-react";
import {
  RABBY_ANDROID_STORE,
  RABBY_IOS_STORE,
  RABBY_MOBILE_PASTE_INSTRUCTIONS,
  isAndroid,
  isIOS,
} from "@/lib/wallet-mobile-rabby";
import type { WalletType } from "@/lib/wallet-context";

type Props = {
  inWalletBrowser?: boolean;
  walletBrowserLabel?: string;
  onConnectRabby?: () => void;
  onConnectMetamask?: () => void;
  onConnectWallet?: (type: WalletType) => void;
  detectedWalletTypes?: WalletType[];
  isConnecting?: boolean;
  onCopyLink?: () => Promise<{ copied: boolean }>;
  pasteHandoffActive?: boolean;
};

export function RabbyMobileConnectHelp({
  inWalletBrowser,
  walletBrowserLabel,
  onConnectRabby,
  onConnectMetamask,
  onConnectWallet,
  detectedWalletTypes = [],
  isConnecting,
  onCopyLink,
  pasteHandoffActive,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!onCopyLink) return;
    const { copied: ok } = await onCopyLink();
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 3000);
  };

  if (inWalletBrowser) {
    return (
      <div className="rounded-xl border-2 border-primary/40 bg-primary/10 p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground">
          You&apos;re in {walletBrowserLabel ?? "your wallet"} — connect to trade
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tap a wallet below. Rabby will ask you to approve; if you have more than one account,
          you&apos;ll pick which one to use on Equilibrium.
        </p>
        <div className="flex flex-col gap-2">
          {onConnectRabby ? (
            <Button
              className="w-full h-12 gap-2"
              onClick={onConnectRabby}
              disabled={isConnecting}
              data-testid="button-connect-rabby-in-app"
            >
              <Wallet className="h-4 w-4" />
              {isConnecting ? "Connecting…" : "Connect Rabby"}
            </Button>
          ) : null}
          {detectedWalletTypes.includes("metamask") && onConnectMetamask ? (
            <Button
              variant="outline"
              className="w-full h-12 gap-2"
              onClick={onConnectMetamask}
              disabled={isConnecting}
              data-testid="button-connect-metamask-in-app"
            >
              <Wallet className="h-4 w-4" />
              {isConnecting ? "Connecting…" : "Connect MetaMask"}
            </Button>
          ) : null}
          {onConnectWallet &&
            detectedWalletTypes
              .filter((t) => t !== "rabby" && t !== "metamask")
              .map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => onConnectWallet(t)}
                  disabled={isConnecting}
                >
                  Connect {t}
                </Button>
              ))}
          {!onConnectRabby && !onConnectMetamask && onConnectWallet ? (
            <Button
              className="w-full h-12"
              onClick={() => onConnectWallet("rabby")}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting…" : "Connect wallet"}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/35 bg-amber-500/8 p-4 space-y-3 text-left">
      <p className="text-sm font-semibold text-foreground">
        Connect from your phone (Rabby)
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Safari and Chrome cannot connect to Rabby directly.{" "}
        <strong>Do not expect &quot;Open Rabby&quot; to load Equilibrium automatically</strong> — you
        must paste the link inside Rabby&apos;s <strong>DApps</strong> browser.
      </p>
      <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
        <li>Tap <strong>Copy link for Rabby</strong> below.</li>
        <li>Open the <strong>Rabby</strong> app (home screen is fine).</li>
        <li>Go to <strong>DApps</strong> or <strong>Websites</strong>.</li>
        <li>Paste the link and press Go — Equilibrium loads inside Rabby.</li>
        <li>Tap <strong>Connect Rabby</strong> and choose your account.</li>
      </ol>
      {pasteHandoffActive ? (
        <p className="text-xs text-green-700 dark:text-green-400 bg-green-500/10 rounded-lg px-3 py-2">
          {RABBY_MOBILE_PASTE_INSTRUCTIONS}
        </p>
      ) : null}
      <Button
        type="button"
        className="w-full h-12 gap-2"
        onClick={() => void handleCopy()}
        data-testid="button-copy-site-for-rabby"
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Link copied — open Rabby → DApps
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copy link for Rabby
          </>
        )}
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
          Install Rabby from app store
        </Button>
      )}
    </div>
  );
}
