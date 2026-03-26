import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";

/**
 * Restricts children to the configured master admin wallet (`ADMIN_EQUILIBRIUM_MASTER_WALLET`).
 * Non-master connected wallets are redirected to the home page.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const { isMasterAdmin, masterConfigured, isLoading } = useIsMasterAdmin();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !address || !masterConfigured) return;
    if (!isMasterAdmin) {
      setLocation("/");
    }
  }, [isLoading, address, masterConfigured, isMasterAdmin, setLocation]);

  if (!address) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Connect wallet</h2>
            <p className="text-muted-foreground">Connect your master admin wallet to open the Command Center.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>Verifying master wallet…</span>
      </div>
    );
  }

  if (!masterConfigured) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Command Center unavailable</h2>
            <p className="text-muted-foreground">
              Set <code className="text-xs">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> on the server.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isMasterAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[30vh] text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Redirecting…</span>
      </div>
    );
  }

  return <>{children}</>;
}
