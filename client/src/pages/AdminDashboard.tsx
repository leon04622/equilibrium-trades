import { useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import axios, { type AxiosInstance } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  MessageSquare,
  BarChart3,
  Loader2,
  RefreshCw,
  Search,
  Zap,
  Crown,
  Sparkles,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import type { WalletUser, SupportMessage } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useChat } from "@/lib/chat-context";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import { useToast } from "@/hooks/use-toast";
import { TIER_PRO, TIER_MENTOR } from "@/lib/subscription-pricing";
import { cn } from "@/lib/utils";

type TabKey = "users" | "support" | "analytics";

function useAdminApi(address: string | undefined): AxiosInstance {
  return useMemo(() => {
    const client = axios.create({
      baseURL: "/",
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
    });
    client.interceptors.request.use((config) => {
      if (address) {
        config.headers["x-wallet-address"] = address;
      }
      return config;
    });
    return client;
  }, [address]);
}

export default function AdminDashboard() {
  const { address } = useWallet();
  const { openSupportInbox } = useChat();
  const { isMasterAdmin, masterConfigured, isLoading: adminCheckLoading } = useIsMasterAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const api = useAdminApi(address ?? undefined);
  const [tab, setTab] = useState<TabKey>("users");
  const [search, setSearch] = useState("");
  const [replyConv, setReplyConv] = useState("");
  const [replyText, setReplyText] = useState("");

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-rest", "users", address],
    enabled: !!address && isMasterAdmin,
    queryFn: async () => {
      const { data, status } = await api.get<WalletUser[]>("/api/users");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load users");
      return data;
    },
  });

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["admin-rest", "messages", address],
    enabled: !!address && isMasterAdmin && tab === "support",
    refetchInterval: tab === "support" ? 8_000 : false,
    queryFn: async () => {
      const { data, status } = await api.get<SupportMessage[]>("/api/messages", { params: { limit: 800 } });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load messages");
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: l1, isLoading: l1Loading, refetch: refetchL1 } = useQuery({
    queryKey: ["admin-rest", "l1", address],
    enabled: !!address && isMasterAdmin && tab === "analytics",
    queryFn: async () => {
      const { data, status } = await api.get("/api/command-center/analytics/hyperliquid");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load L1 analytics");
      return data as {
        hyperliquid?: { totalDayNotionalVolumeUsd?: number; totalOpenInterestUsd?: number };
        sovereignCohort?: { instantTradingHandshakeComplete?: number; builderCodeApproved?: number };
        note?: string;
      };
    },
  });

  const conversations = useMemo(() => {
    const map = new Map<string, SupportMessage[]>();
    for (const m of messages) {
      const id = m.conversationId.toLowerCase();
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(m);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    }
    return Array.from(map.entries()).sort(
      (a, b) =>
        new Date(b[1][b[1].length - 1]?.createdAt || 0).getTime() -
        new Date(a[1][a[1].length - 1]?.createdAt || 0).getTime(),
    );
  }, [messages]);

  useEffect(() => {
    if (!replyConv && conversations.length > 0) {
      setReplyConv(conversations[0]![0]);
    }
  }, [conversations, replyConv]);

  const threadMessages = useMemo(() => {
    if (!replyConv) return [];
    return messages.filter((m) => m.conversationId.toLowerCase() === replyConv.toLowerCase());
  }, [messages, replyConv]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.walletAddress.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)),
    );
  }, [users, search]);

  const overrideMutation = useMutation({
    mutationFn: async ({ wallet, mode }: { wallet: string; mode: "pro" | "mentoring" }) => {
      const enc = encodeURIComponent(wallet);
      const body = mode === "mentoring" ? { isMentee: true } : { isSubscribed: true };
      const { data, status } = await api.patch(`/api/users/${enc}/subscription`, body);
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) throw new Error((data as { error?: string })?.error || "Update failed");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rest", "users"] });
      toast({ title: "Override applied" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      if (!replyConv.trim() || !replyText.trim()) throw new Error("Pick a conversation and enter a message");
      const { data, status } = await api.post("/api/support/messages", {
        conversationId: replyConv.trim().toLowerCase(),
        message: replyText.trim(),
        senderName: "Support Team",
      });
      if (status < 200 || status >= 300) throw new Error((data as { error?: string })?.error || "Send failed");
      return data;
    },
    onSuccess: () => {
      setReplyText("");
      void refetchMessages();
      void queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/support/messages"] });
      toast({ title: "Reply sent", description: "Customer sees this in Live Support and via real-time sync." });
    },
    onError: (e: Error) => toast({ title: "Reply failed", description: e.message, variant: "destructive" }),
  });

  const nav = useCallback(
    (k: TabKey, label: string, icon: ReactNode) => (
      <Button
        key={k}
        variant={tab === k ? "secondary" : "ghost"}
        className={cn("w-full justify-start gap-2", tab === k && "bg-primary/10 border border-primary/20")}
        onClick={() => setTab(k)}
      >
        {icon}
        {label}
      </Button>
    ),
    [tab],
  );

  if (adminCheckLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (!masterConfigured) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Equilibrium Admin - System Online</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Command Center is not configured: set <code className="text-xs bg-muted px-1 rounded">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> on
          the server.
        </p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Equilibrium Admin - System Online</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connect your master admin wallet to open the CRM and support tools.</p>
      </div>
    );
  }

  if (!isMasterAdmin) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Equilibrium Admin - System Online</h1>
        <p className="mt-2 text-sm text-muted-foreground">Master admin wallet only. The connected address is not authorized for Command Center.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Equilibrium Command Center</h1>
            <p className="text-xs text-muted-foreground">
              CRM + tickets · same pipeline as Live Support · Pro ${TIER_PRO} / Mentoring ${TIER_MENTOR}
            </p>
          </div>
        </div>
        <Button variant="default" size="sm" className="shrink-0 gap-2" onClick={() => openSupportInbox()}>
          <MessageCircle className="h-4 w-4" />
          Open support inbox
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <aside className="w-full md:w-52 shrink-0 space-y-1 rounded-xl border bg-card p-2">
          {nav("users", "CRM & users", <Users className="h-4 w-4" />)}
          {nav("support", "Support tickets", <MessageSquare className="h-4 w-4" />)}
          {nav("analytics", "L1 analytics", <BarChart3 className="h-4 w-4" />)}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          {tab === "users" && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Wallet users</CardTitle>
                  <CardDescription>Wallet, email, tier — manual Pro / Mentoring overrides</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-8 h-9" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => void refetchUsers()} disabled={usersLoading}>
                    <RefreshCw className={cn("h-4 w-4", usersLoading && "animate-spin")} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <ScrollArea className="h-[min(60vh,560px)]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Wallet</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead className="text-right">Overrides</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-mono text-xs max-w-[140px] truncate">{u.walletAddress}</TableCell>
                            <TableCell className="text-xs">{u.email || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.createdAt ? new Date(u.createdAt as unknown as string).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {u.subscriptionTier}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Chat with this wallet"
                                onClick={() => openSupportInbox(u.walletAddress.toLowerCase())}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-[10px]"
                                disabled={overrideMutation.isPending}
                                onClick={() => overrideMutation.mutate({ wallet: u.walletAddress, mode: "pro" })}
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                Grant Pro ${TIER_PRO}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-[10px]"
                                disabled={overrideMutation.isPending}
                                onClick={() => overrideMutation.mutate({ wallet: u.walletAddress, mode: "mentoring" })}
                              >
                                <Crown className="h-3 w-3 mr-1" />
                                Mentoring ${TIER_MENTOR}
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
          )}

          {tab === "support" && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Tickets</CardTitle>
                    <CardDescription>
                      Newest threads first. User messages hit Telegram when <code className="text-[10px]">TELEGRAM_*</code> env is set.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => void refetchMessages()} disabled={msgLoading}>
                    <RefreshCw className={cn("h-4 w-4", msgLoading && "animate-spin")} />
                  </Button>
                </CardHeader>
                <CardContent>
                  {msgLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <ScrollArea className="h-[360px] space-y-2">
                      {conversations.map(([cid, msgs]) => (
                        <div
                          key={cid}
                          className={cn(
                            "rounded-lg border p-2 mb-2 text-xs flex gap-2 items-start",
                            replyConv === cid ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setReplyConv(cid)}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="font-mono truncate">{cid}</div>
                            <div className="text-muted-foreground line-clamp-2 mt-1">{msgs[msgs.length - 1]?.message}</div>
                          </button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            title="Open in floating chat"
                            onClick={() => openSupportInbox(cid)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Thread & reply</CardTitle>
                  <CardDescription>Uses the same endpoint as Live Support — customers receive via SSE + polling.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Conversation id</Label>
                    <Input className="font-mono text-xs" value={replyConv} onChange={(e) => setReplyConv(e.target.value)} />
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border p-2 text-xs space-y-2">
                    {threadMessages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded border px-2 py-1",
                          m.senderType === "admin" ? "bg-muted/60" : "bg-primary/10",
                        )}
                      >
                        <span className="text-[10px] text-muted-foreground">{m.senderType}</span> — {m.message}
                      </div>
                    ))}
                  </ScrollArea>
                  <Textarea
                    rows={4}
                    placeholder="Admin reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <Button className="w-full" disabled={sendReply.isPending} onClick={() => sendReply.mutate()}>
                    {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reply"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "analytics" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>L1 performance</CardTitle>
                  <CardDescription>Hyperliquid Info API (via server)</CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => void refetchL1()} disabled={l1Loading}>
                  <RefreshCw className={cn("h-4 w-4", l1Loading && "animate-spin")} />
                </Button>
              </CardHeader>
              <CardContent>
                {l1Loading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3 w-3" /> 24h perp notional (USD)
                      </div>
                      <p className="text-xl font-bold mt-1">
                        $
                        {Number(l1?.hyperliquid?.totalDayNotionalVolumeUsd || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Open interest (est.)</div>
                      <p className="text-xl font-bold mt-1">
                        $
                        {Number(l1?.hyperliquid?.totalOpenInterestUsd || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 sm:col-span-2">
                      <div className="text-xs text-muted-foreground">Handshake complete (DB)</div>
                      <p className="text-xl font-bold mt-1">{l1?.sovereignCohort?.instantTradingHandshakeComplete ?? 0}</p>
                    </div>
                  </div>
                )}
                {l1?.note && <p className="text-xs text-muted-foreground mt-4 border-t pt-3">{l1.note}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
