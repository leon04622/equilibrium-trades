import { useMemo, useState } from "react";
import { Users, MessageSquare, BarChart3, ShieldAlert } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Replace with your master address, or set `VITE_ADMIN_WALLET` at build time. */
const ADMIN_WALLET_PLACEHOLDER = "YOUR_ADMIN_WALLET";

const PLACEHOLDER_NORMALIZED = ADMIN_WALLET_PLACEHOLDER.trim().toLowerCase();

type AdminTab = "users" | "messages" | "analytics";

function normalizeWallet(w: string | null | undefined): string {
  return (w ?? "").trim().toLowerCase();
}

export default function Admin() {
  const { address } = useWallet();
  const [tab, setTab] = useState<AdminTab>("users");

  const allowedWallet = useMemo(() => {
    const fromEnv = (import.meta.env.VITE_ADMIN_WALLET as string | undefined)?.trim();
    if (fromEnv) return normalizeWallet(fromEnv);
    return normalizeWallet(ADMIN_WALLET_PLACEHOLDER);
  }, []);

  const walletAddress = normalizeWallet(address);
  const isConfigured = allowedWallet !== PLACEHOLDER_NORMALIZED;
  const isAdmin = isConfigured && walletAddress.length > 0 && walletAddress === allowedWallet;

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <div>
              <CardTitle>Admin access</CardTitle>
              <CardDescription>Connect the configured admin wallet to open this panel.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Set <code className="text-xs bg-muted px-1 rounded">VITE_ADMIN_WALLET</code> to your address, or replace{" "}
              <code className="text-xs bg-muted px-1 rounded">ADMIN_WALLET_PLACEHOLDER</code> in{" "}
              <code className="text-xs bg-muted px-1 rounded">admin.tsx</code>.
            </p>
            {!address ? <p className="text-amber-600 dark:text-amber-400">No wallet connected.</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Minimal panel — static tabs until features are re-enabled.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4 shrink-0" />
            Users
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4 shrink-0" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>User management will load here after API wiring.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No data — placeholder tab.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <CardDescription>Support and system messages will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No data — placeholder tab.</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
              <CardDescription>Charts and KPIs will mount here.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">No data — placeholder tab.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
