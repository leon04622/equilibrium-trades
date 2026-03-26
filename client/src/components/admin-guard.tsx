import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Loader2, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/lib/wallet-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";

/**
 * Master access: server `ADMIN_EQUILIBRIUM_MASTER_WALLET` (via /api/command-center/status).
 * Optional client double-check: set `VITE_ADMIN_MASTER_WALLET=0x...` at build time so only that address
 * can render the panel even if the API were misconfigured (does not replace server-side checks on APIs).
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const { isMasterAdmin, masterConfigured, isLoading } = useIsMasterAdmin();
  const [, setLocation] = useLocation();
  const clientExpected = (import.meta.env.VITE_ADMIN_MASTER_WALLET as string | undefined)?.trim().toLowerCase();

  const clientWalletOk =
    !clientExpected || (address?.trim().toLowerCase() === clientExpected);

  useEffect(() => {
    if (isLoading || !address || !masterConfigured) return;
    if (!isMasterAdmin || !clientWalletOk) {
      setLocation("/");
    }
  }, [isLoading, address, masterConfigured, isMasterAdmin, clientWalletOk, setLocation]);

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

  if (!isMasterAdmin || !clientWalletOk) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[30vh] text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Redirecting…</span>
      </div>
    );
  }

  return <>{children}</>;
}
