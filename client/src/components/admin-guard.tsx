import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { isFortressSovereignWallet } from "@/lib/fortress-admin";
import NotFound from "@/pages/not-found";
import { Button } from "@/components/ui/button";

type AdminGuardProps = {
  children: ReactNode;
};

/**
 * Renders a 404 for anyone who is not the hardcoded sovereign wallet.
 * Unauthenticated visitors see a minimal “connect” prompt instead of exposing `/admin`.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { address, isConnected } = useWallet();

  if (!isConnected || !address) {
    return (
      <div className="p-6 md:p-10 max-w-lg mx-auto space-y-4 text-center">
        <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-semibold font-display">Admin Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Connect the sovereign wallet to open this area.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (!isFortressSovereignWallet(address)) {
    return <NotFound />;
  }

  return <>{children}</>;
}
