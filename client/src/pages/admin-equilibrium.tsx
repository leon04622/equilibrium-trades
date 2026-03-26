import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BrowserProvider } from "ethers";
import {
  Shield,
  Loader2,
  Search,
  Users,
  MessageSquare,
  BarChart3,
  LogOut,
  Crown,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import type { WalletUser, SupportMessage } from "@shared/schema";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "eq_admin_crm_token";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export default function AdminEquilibrium() {
  const { address, isConnected, connect } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_KEY) || "" : "",
  );
  const [signBusy, setSignBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [supportConv, setSupportConv] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const persistToken = useCallback((t: string) => {
    setToken(t);
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  }, []);

  const handleSignIn = async () => {
    if (!window.ethereum) {
      toast({ title: "No wallet", description: "Install a browser wallet.", variant: "destructive" });
      return;
    }
    setSignBusy(true);
    try {
      if (!isConnected) await connect();
      const chRes = await fetch("/api/admin-equilibrium/challenge");
      if (!chRes.ok) throw new Error("Challenge failed");
      const { nonce, message } = (await chRes.json()) as { nonce: string; message: string };
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);
      const vRes = await fetch("/api/admin-equilibrium/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, signature }),
      });
      const data = await vRes.json();
      if (!vRes.ok) throw new Error(data.error || "Verify failed");
      persistToken(data.accessToken);
      toast({ title: "CRM unlocked", description: "Session is valid for several hours." });
    } catch (e: unknown) {
      toast({
        title: "Access denied",
        description: e instanceof Error ? e.message : "Could not verify signature",
        variant: "destructive",
      });
    } finally {
      setSignBusy(false);
    }
  };

  const logout = async () => {
    if (token) {
      await fetch("/api/admin-equilibrium/session/revoke", {
        method: "POST",
        headers: authHeaders(token),
      }).catch(() => {});
    }
    persistToken("");
    queryClient.removeQueries({ queryKey: ["admin-equilibrium"] });
  };

  const usersQuery = useQuery({
    queryKey: ["admin-equilibrium", "users", token],
    queryFn: async () => {
      const res = await fetch("/api/admin-equilibrium/users", { headers: authHeaders(token) });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json() as Promise<WalletUser[]>;
    },
    enabled: !!token,
  });

  const conversationsQuery = useQuery({
    queryKey: ["admin-equilibrium", "conversations", token],
    queryFn: async () => {
      const res = await fetch("/api/admin-equilibrium/conversations", { headers: authHeaders(token) });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json() as Promise<
        { conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]
      >;
    },
    enabled: !!token,
    refetchInterval: 12_000,
  });

  const analyticsQuery = useQuery({
    queryKey: ["admin-equilibrium", "analytics", token],
    queryFn: async () => {
      const res = await fetch("/api/admin-equilibrium/analytics/hyperliquid", {
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60_000,
  });

  const grantProMutation = useMutation({
    mutationFn: async (walletAddress: string) => {
      const enc = encodeURIComponent(walletAddress);
      const res = await fetch(`/api/admin-equilibrium/users/${enc}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          walletAddress,
          subscriptionTier: "pro",
          subscriptionActive: true,
          manualProOverride: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-equilibrium", "users"] });
      toast({ title: "Pro granted", description: "Manual override is on; Stripe is not required." });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendSupportMutation = useMutation({
    mutationFn: async () => {
      if (!supportConv || !replyText.trim()) throw new Error("Select a thread and enter a message");
      const res = await fetch("/api/admin-equilibrium/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          conversationId: supportConv,
          senderType: "admin",
          senderWallet: null,
          senderName: "Equilibrium Support",
          message: replyText.trim(),
          isRead: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Send failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["admin-equilibrium", "conversations"] });
      toast({ title: "Reply sent", description: "User UI updates via live stream / poll." });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filteredUsers = useMemo(() => {
    const u = usersQuery.data || [];
    const q = search.toLowerCase();
    if (!q) return u;
    return u.filter(
      (x) =>
        x.walletAddress.toLowerCase().includes(q) ||
        (x.email && x.email.toLowerCase().includes(q)),
    );
  }, [usersQuery.data, search]);

  if (!token) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Equilibrium CRM</CardTitle>
            <CardDescription>
              Sign with your master admin wallet to access sovereign user data, support, and analytics.
              Set <code className="text-xs">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> on the server to lock
              to one address; otherwise any configured admin wallet may sign.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {address && (
              <p className="text-xs text-muted-foreground text-center font-mono">
                Connected: {address.slice(0, 6)}…{address.slice(-4)}
              </p>
            )}
            <Button className="w-full h-12" disabled={signBusy} onClick={() => void handleSignIn()}>
              {signBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Waiting for signature…
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Unlock with wallet signature
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equilibrium CRM</h1>
          <p className="text-sm text-muted-foreground">Sovereign wallet data · Support · Hyperliquid HUD</p>
        </div>
        <Button variant="outline" className="h-10 gap-2" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" />
          Lock CRM
        </Button>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <MessageSquare className="h-4 w-4" />
            Support
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Wallet directory</CardTitle>
              <CardDescription>Search, inspect tiers, grant Pro without Stripe.</CardDescription>
              <div className="pt-2">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search wallet or email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {usersQuery.isLoading ? (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <ScrollArea className="h-[min(60vh,520px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wallet</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Flags</TableHead>
                        <TableHead>Handshake</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs">{u.walletAddress}</TableCell>
                          <TableCell className="text-xs">{u.email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {u.subscriptionTier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs space-x-1">
                            {u.manualProOverride && (
                              <Badge className="bg-amber-600/90">Manual Pro</Badge>
                            )}
                            {u.builderCodeApproved && <Badge variant="secondary">Builder</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {u.instantTradingCompletedAt
                              ? new Date(u.instantTradingCompletedAt).toLocaleString()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8"
                              disabled={
                                grantProMutation.isPending ||
                                (u.subscriptionTier === "pro" && u.subscriptionActive && u.manualProOverride)
                              }
                              onClick={() => grantProMutation.mutate(u.walletAddress)}
                            >
                              <Crown className="h-3.5 w-3.5 mr-1" />
                              Grant Pro
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Conversations</CardTitle>
                <CardDescription>Reply pushes to the user chat (SSE + poll).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ScrollArea className="h-[320px]">
                  {(conversationsQuery.data || []).map((c) => (
                    <button
                      key={c.conversationId}
                      type="button"
                      onClick={() => setSupportConv(c.conversationId)}
                      className={cn(
                        "w-full text-left rounded-lg border p-3 mb-2 transition-colors",
                        supportConv === c.conversationId
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div className="font-mono text-xs truncate">{c.conversationId}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {c.lastMessage?.message}
                      </div>
                      {c.unreadCount > 0 && (
                        <Badge variant="destructive" className="mt-2 text-[10px]">
                          {c.unreadCount} unread
                        </Badge>
                      )}
                    </button>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Reply</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Type a reply…"
                  rows={6}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={!supportConv}
                />
                <Button
                  className="w-full h-11"
                  disabled={!supportConv || sendSupportMutation.isPending}
                  onClick={() => sendSupportMutation.mutate()}
                >
                  {sendSupportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Send to user"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Hyperliquid · Sovereign cohort</CardTitle>
              <CardDescription>
                Exchange figures are market-wide (public API). Builder-segmented volume is not published as a
                single aggregate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analyticsQuery.isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : analyticsQuery.data ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" /> 24h perp notional (HL)
                    </div>
                    <p className="text-xl font-bold mt-1">
                      $
                      {Number(
                        analyticsQuery.data.hyperliquid?.totalDayNotionalVolumeUsd || 0,
                      ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Open interest (est. USD)</div>
                    <p className="text-xl font-bold mt-1">
                      $
                      {Number(
                        analyticsQuery.data.hyperliquid?.totalOpenInterestUsd || 0,
                      ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Sovereign handshakes</div>
                    <p className="text-xl font-bold mt-1">
                      {analyticsQuery.data.sovereignCohort?.instantTradingHandshakeComplete ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Builder-approved wallets:{" "}
                      {analyticsQuery.data.sovereignCohort?.builderCodeApproved ?? 0}
                    </p>
                  </div>
                </div>
              ) : null}
              {analyticsQuery.data?.note && (
                <p className="text-xs text-muted-foreground border-t pt-3">{analyticsQuery.data.note}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
