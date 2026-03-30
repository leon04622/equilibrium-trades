import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { useWallet } from "@/lib/wallet-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Hard Pro gate: blurs protected content for Free wallets and shows upgrade CTA.
 * Use around AI Signals scanner, Educational Vault, and Heatmap — does not alter inner feature logic.
 */
export function SubscriptionGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, connect } = useWallet();
  const { isPro, isLoading, isSyncError, refetch } = useSubscription();

  if (!isConnected) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-lg">Connect your wallet</CardTitle>
            <CardDescription>We verify Pro access from your connected address.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void connect()}>
              Connect wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSyncError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-lg">Could not verify subscription</CardTitle>
            <CardDescription>
              The server did not return your tier. Your Pro or Mentor access is stored in Mongo — try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => void refetch()}>
              Retry sync
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span>Loading subscription from your account…</span>
      </div>
    );
  }

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-[50vh] w-full">
      <div className="pointer-events-none min-h-[inherit] select-none blur-md opacity-45">{children}</div>
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm p-4">
        <Card className="max-w-md w-full border-primary/35 shadow-xl shadow-primary/10">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-xl font-display">Equilibrium Pro Required</CardTitle>
            <CardDescription className="text-base">
              Unlock AI Patterns and SMA Masterclass for $50/mo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild className="w-full" size="lg">
              <Link to="/pricing">Upgrade to Pro</Link>
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
