import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Users,
  Shield,
  Crown,
  Zap,
  Sparkles,
  Check,
  RefreshCw,
  Search,
  Mail,
  Download,
  Loader2,
  UserPlus,
  MessageCircle,
  BarChart3,
  Radio,
} from "lucide-react";
import type { Lead } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useIsMasterAdmin } from "@/hooks/use-is-master-admin";
import type { WalletUser, SupportMessage } from "@shared/schema";
import { cn } from "@/lib/utils";
import {
  PRO_MONTHLY_USD,
  MENTORING_MONTHLY_USD,
  TIER_PRO,
  TIER_MENTOR,
} from "@/lib/subscription-pricing";

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type TierEdit = "free" | "pro" | "mentoring";

export default function Admin() {
  const { address } = useWallet();
  const { toast } = useToast();
  const { isMasterAdmin, masterConfigured, isLoading: masterLoading } = useIsMasterAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<WalletUser | null>(null);
  const [editTier, setEditTier] = useState<TierEdit>("free");
  const [editActive, setEditActive] = useState(false);
  const [grantWallet, setGrantWallet] = useState("");
  const [grantTier, setGrantTier] = useState<TierEdit>("pro");
  const [grantActive, setGrantActive] = useState(true);
  const [grantBuilderApproved, setGrantBuilderApproved] = useState(true);
  const [supportConvId, setSupportConvId] = useState<string>("");
  const [supportReply, setSupportReply] = useState("");
  const [logLines, setLogLines] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const cmdHeaders = useCallback(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (address) h["x-wallet-address"] = address;
    return h;
  }, [address]);

  const { data: leads = [], isLoading: leadsLoading, refetch: refetchLeads } = useQuery<Lead[]>({
    queryKey: ["/api/command-center/leads"],
    enabled: isMasterAdmin && !!address,
    queryFn: async () => {
      const res = await fetch("/api/command-center/leads", { headers: cmdHeaders() });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  const { data: users = [], isLoading, refetch } = useQuery<WalletUser[]>({
    queryKey: ["/api/command-center/users"],
    enabled: isMasterAdmin && !!address,
    queryFn: async () => {
      const res = await fetch("/api/command-center/users", { headers: cmdHeaders() });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: conversations = [], refetch: refetchConversations } = useQuery<
    { conversationId: string; lastMessage: SupportMessage; unreadCount: number }[]
  >({
    queryKey: ["/api/command-center/conversations"],
    enabled: isMasterAdmin && !!address,
    queryFn: async () => {
      const res = await fetch("/api/command-center/conversations", { headers: cmdHeaders() });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: activeSection === "support" ? 6_000 : 12_000,
  });

  const { data: supportMessages = [], refetch: refetchSupportMessages } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/messages", supportConvId],
    queryFn: async () => {
      if (!supportConvId) return [];
      const res = await fetch(`/api/support/messages/${encodeURIComponent(supportConvId)}`, {
        headers: cmdHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isMasterAdmin && !!address && !!supportConvId,
    refetchInterval: activeSection === "support" && supportConvId ? 5_000 : false,
  });

  const { data: hlAnalytics, isLoading: hlLoading, refetch: refetchHl } = useQuery({
    queryKey: ["/api/command-center/analytics/hyperliquid"],
    enabled: isMasterAdmin && !!address,
    queryFn: async () => {
      const res = await fetch("/api/command-center/analytics/hyperliquid", { headers: cmdHeaders() });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  useEffect(() => {
    if (!supportConvId) return;
    void fetch(`/api/support/messages/${encodeURIComponent(supportConvId)}/read`, {
      method: "POST",
      headers: cmdHeaders(),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/conversations"] });
    });
  }, [supportConvId, address, cmdHeaders]);

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({
      walletAddress,
      tier,
      active,
      builderCodeApproved,
      manualProOverride,
    }: {
      walletAddress: string;
      tier: string;
      active: boolean;
      builderCodeApproved?: boolean;
      manualProOverride?: boolean;
    }) => {
      const encoded = encodeURIComponent(walletAddress.trim());
      const body: Record<string, unknown> = {
        subscriptionTier: tier,
        subscriptionActive: active,
      };
      if (typeof builderCodeApproved === "boolean") body.builderCodeApproved = builderCodeApproved;
      if (typeof manualProOverride === "boolean") body.manualProOverride = manualProOverride;
      const res = await fetch(`/api/command-center/users/${encoded}/subscription`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: cmdHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update subscription");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription Updated", description: "User subscription has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/users"] });
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscription",
        variant: "destructive",
      });
    },
  });

  const tierOverrideMutation = useMutation({
    mutationFn: async ({
      walletAddress,
      mode,
    }: {
      walletAddress: string;
      mode: "pro" | "mentoring";
    }) => {
      const encoded = encodeURIComponent(walletAddress.trim());
      const body =
        mode === "mentoring" ? { isMentee: true } : { isSubscribed: true };
      const res = await fetch(`/api/command-center/users/${encoded}/subscription`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: cmdHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Override failed");
      }
      return res.json();
    },
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/command-center/users"] });
      toast({
        title: v.mode === "mentoring" ? "Mentoring override" : "Pro override",
        description: `Wallet updated ($${v.mode === "mentoring" ? TIER_MENTOR : TIER_PRO}/mo tier).`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Override failed", description: e.message, variant: "destructive" });
    },
  });

  const supportReplyMutation = useMutation({
    mutationFn: async ({ conversationId, message }: { conversationId: string; message: string }) => {
      const res = await fetch("/api/command-center/support/reply", {
        method: "POST",
        headers: cmdHeaders(),
        body: JSON.stringify({ conversationId, message }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      setSupportReply("");
      refetchSupportMessages();
      refetchConversations();
      toast({ title: "Reply sent" });
    },
    onError: (e: Error) => {
      toast({ title: "Reply failed", description: e.message, variant: "destructive" });
    },
  });

  const handleEditUser = (user: WalletUser) => {
    setEditingUser(user);
    setEditTier(user.subscriptionTier === "mentoring" ? "mentoring" : user.subscriptionTier === "pro" ? "pro" : "free");
    setEditActive(user.subscriptionActive);
  };

  const handleSaveSubscription = () => {
    if (!editingUser) return;
    updateSubscriptionMutation.mutate({
      walletAddress: editingUser.walletAddress,
      tier: editTier,
      active: editActive,
    });
  };

  const handleGrantWallet = () => {
    const w = grantWallet.trim();
    if (!ETH_ADDRESS_RE.test(w)) {
      toast({
        title: "Invalid wallet",
        description: "Use a full 42-character address starting with 0x.",
        variant: "destructive",
      });
      return;
    }
    updateSubscriptionMutation.mutate(
      {
        walletAddress: w,
        tier: grantTier,
        active: grantActive,
        builderCodeApproved: grantBuilderApproved,
        manualProOverride: grantTier !== "free" && grantActive,
      },
      { onSuccess: () => setGrantWallet("") },
    );
  };

  const filteredUsers = users.filter(
    (user) =>
      user.walletAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
  );

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "mentoring":
        return <Crown className="h-4 w-4 text-warning" />;
      case "pro":
        return <Sparkles className="h-4 w-4 text-primary" />;
      default:
        return <Zap className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTierBadge = (tier: string, active: boolean) => {
    if (!active && tier !== "free") {
      return <Badge variant="secondary" className="text-muted-foreground">Inactive</Badge>;
    }
    switch (tier) {
      case "mentoring":
        return <Badge className="bg-warning/15 text-warning border-warning/30">Mentoring</Badge>;
      case "pro":
        return <Badge className="bg-primary/15 text-primary border-primary/30">AI Pro</Badge>;
      default:
        return <Badge variant="secondary">Free</Badge>;
    }
  };

  useEffect(() => {
    if (!isMasterAdmin || !address) return;
    let ws: WebSocket | null = null;
    let cancelled = false;
    (async () => {
      try {
        const tokRes = await fetch("/api/command-center/ws-token", { headers: cmdHeaders() });
        if (!tokRes.ok || cancelled) return;
        const { token } = (await tokRes.json()) as { token?: string };
        if (!token || cancelled) return;
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const url = `${proto}://${window.location.host}/ws/command-center-log?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          try {
            const j = JSON.parse(ev.data as string) as { type?: string; message?: string; channel?: string; level?: string; ts?: string };
            if (j.type === "log") {
              const line = `${j.ts || ""} [${j.channel}/${j.level}] ${j.message || ""}`;
              setLogLines((prev) => [...prev.slice(-400), line]);
            } else if (j.type === "error") {
              setLogLines((prev) => [...prev.slice(-400), `error: ${j.message || "unknown"}`]);
            }
          } catch {
            setLogLines((prev) => [...prev.slice(-400), String(ev.data)]);
          }
        };
        ws.onerror = () => {
          setLogLines((prev) => [...prev.slice(-400), "[ws] connection error"]);
        };
      } catch {
        setLogLines((prev) => [...prev.slice(-400), "[ws] failed to obtain token"]);
      }
    })();
    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [isMasterAdmin, address, cmdHeaders]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines.length]);

  const navBtn = (id: CommandSection, label: string, icon: ReactNode) => (
    <Button
      variant={activeSection === id ? "secondary" : "ghost"}
      className={cn("w-full justify-start gap-2", activeSection === id && "bg-primary/10 border border-primary/20")}
      onClick={() => setActiveSection(id)}
      data-testid={`nav-command-${id}`}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-2xl md:text-3xl font-display font-bold">Equilibrium Command Center</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Unified panel · Pro ${TIER_PRO}/mo · Mentoring ${TIER_MENTOR}/mo (maps to <code className="text-xs">subscriptionTier</code>{" "}
          + <code className="text-xs">manualProOverride</code> in the database).
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <aside className="w-full lg:w-56 shrink-0 space-y-1 rounded-xl border bg-card p-2">
          {navBtn("crm", "Users & CRM", <Users className="h-4 w-4" />)}
          {navBtn("support", "Support Tickets", <MessageCircle className="h-4 w-4" />)}
          {navBtn("l1", "L1 Performance", <BarChart3 className="h-4 w-4" />)}
        </aside>

        <div className="flex-1 min-w-0 grid gap-4 lg:grid-cols-[1fr_minmax(260px,300px)]">
          <div className="space-y-4 min-w-0">
          {activeSection === "crm" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{users.length}</p>
                      <p className="text-xs text-muted-foreground">Total Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {users.filter((u) => u.subscriptionTier === "pro" && u.subscriptionActive).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Pro (${PRO_MONTHLY_USD}/mo)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                      <Crown className="h-5 w-5 text-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {users.filter((u) => u.subscriptionTier === "mentoring" && u.subscriptionActive).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Mentoring (${MENTORING_MONTHLY_USD}/mo)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
                      <Check className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{users.filter((u) => u.builderCodeApproved).length}</p>
                      <p className="text-xs text-muted-foreground">Onboarded</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
                      <Mail className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{leads.length}</p>
                      <p className="text-xs text-muted-foreground">Email Leads</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-1">
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-primary" />
                    Grant or bootstrap user
                  </CardTitle>
                  <CardDescription>Create or update a user by wallet.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="grant-wallet">Wallet address (0x…)</Label>
                  <Input
                    id="grant-wallet"
                    placeholder="0x…"
                    value={grantWallet}
                    onChange={(e) => setGrantWallet(e.target.value)}
                    className="font-mono text-sm"
                    data-testid="input-grant-wallet"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                  <div className="space-y-2 flex-1">
                    <Label>Tier</Label>
                    <Select value={grantTier} onValueChange={(v) => setGrantTier(v as TierEdit)}>
                      <SelectTrigger data-testid="select-grant-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro — ${PRO_MONTHLY_USD}/mo (AI + video)</SelectItem>
                        <SelectItem value="mentoring">Mentoring — ${MENTORING_MONTHLY_USD}/mo (+ Pro)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-start sm:pb-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={grantActive} onCheckedChange={setGrantActive} id="grant-active" />
                      <Label htmlFor="grant-active" className="cursor-pointer">Active</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={grantBuilderApproved} onCheckedChange={setGrantBuilderApproved} id="grant-builder" />
                      <Label htmlFor="grant-builder" className="cursor-pointer">Builder approved</Label>
                    </div>
                  </div>
                  <Button
                    onClick={handleGrantWallet}
                    disabled={updateSubscriptionMutation.isPending || !grantWallet.trim()}
                    data-testid="button-grant-wallet"
                  >
                    {updateSubscriptionMutation.isPending ? "Saving…" : "Apply"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Registered wallets and subscriptions</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search wallet or email…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                        data-testid="input-search-users"
                      />
                    </div>
                    <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading} data-testid="button-refresh-users">
                      <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchQuery ? "No matches" : "No users yet"}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Wallet</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Sub tier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                            <TableCell className="font-mono text-xs">
                              {user.walletAddress.slice(0, 6)}…{user.walletAddress.slice(-4)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">{user.email || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {user.createdAt ? new Date(user.createdAt as unknown as string).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTierIcon(user.subscriptionTier)}
                                <span className="capitalize text-xs">
                                  {user.subscriptionTier === "pro" ? "Pro" : user.subscriptionTier === "mentoring" ? "Mentoring" : user.subscriptionTier}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getTierBadge(user.subscriptionTier, user.subscriptionActive)}</TableCell>
                            <TableCell className="text-right space-y-1">
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-[10px] px-2"
                                  disabled={tierOverrideMutation.isPending}
                                  onClick={() =>
                                    tierOverrideMutation.mutate({ walletAddress: user.walletAddress, mode: "pro" })
                                  }
                                  title={`Override Pro ($${TIER_PRO}/mo)`}
                                >
                                  Pro ${TIER_PRO}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[10px] px-2"
                                  disabled={tierOverrideMutation.isPending}
                                  onClick={() =>
                                    tierOverrideMutation.mutate({ walletAddress: user.walletAddress, mode: "mentoring" })
                                  }
                                  title={`Override Mentoring ($${TIER_MENTOR}/mo)`}
                                >
                                  Mentor ${TIER_MENTOR}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7" onClick={() => handleEditUser(user)} data-testid={`button-edit-${user.id}`}>
                                  Edit
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-blue-500" />
                      Email Leads
                    </CardTitle>
                    <CardDescription>Wallet gate captures</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const csv = [
                          ["Email", "Name", "Source", "Wallet", "Date"].join(","),
                          ...leads.map((l) =>
                            [l.email, l.name || "", l.source || "", l.walletAddress || "", l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ""].join(
                              ",",
                            ),
                          ),
                        ].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "equilibrium-leads.csv";
                        a.click();
                      }}
                      data-testid="button-export-leads"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => refetchLeads()} disabled={leadsLoading} data-testid="button-refresh-leads">
                      <RefreshCw className={cn("h-4 w-4", leadsLoading && "animate-spin")} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {leadsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading leads…</div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No leads yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Wallet</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leads.map((lead) => (
                          <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                            <TableCell className="font-medium">{lead.email}</TableCell>
                            <TableCell className="text-muted-foreground">{lead.name || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {lead.source || "landing"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {lead.walletAddress ? `${lead.walletAddress.slice(0, 6)}…${lead.walletAddress.slice(-4)}` : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          )}

          {activeSection === "support" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Support inbox</CardTitle>
                <CardDescription>Select a conversation by wallet or guest id (string id, not index).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-md">
                  <Label>Selected conversation</Label>
                  <Select
                    value={supportConvId}
                    onValueChange={(v) => setSupportConvId(v)}
                  >
                    <SelectTrigger data-testid="select-support-conversation">
                      <SelectValue placeholder="Choose conversation…" />
                    </SelectTrigger>
                    <SelectContent>
                      {conversations.map((c) => (
                        <SelectItem key={c.conversationId} value={c.conversationId}>
                          {c.conversationId.startsWith("guest_")
                            ? `Guest ${c.conversationId.slice(0, 14)}…`
                            : `${c.conversationId.slice(0, 6)}…${c.conversationId.slice(-4)}`}
                          {c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <ScrollArea className="h-[320px] rounded-md border p-3">
                  {!supportConvId ? (
                    <p className="text-sm text-muted-foreground">Pick a conversation to load messages.</p>
                  ) : supportMessages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No messages in this thread.</p>
                  ) : (
                    <div className="space-y-3">
                      {supportMessages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm",
                            m.senderType === "admin" ? "bg-muted/50 ml-0 mr-8" : "bg-primary/10 ml-8 mr-0",
                          )}
                        >
                          <p className="text-[10px] text-muted-foreground mb-1">
                            {m.senderType} · {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                            {m.clientSentAt ? ` · client ${new Date(m.clientSentAt).toLocaleString()}` : ""}
                          </p>
                          {m.message}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>

                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Reply</Label>
                    <Input
                      value={supportReply}
                      onChange={(e) => setSupportReply(e.target.value)}
                      placeholder="Type admin reply…"
                      disabled={!supportConvId || supportReplyMutation.isPending}
                    />
                  </div>
                  <Button
                    disabled={!supportConvId || !supportReply.trim() || supportReplyMutation.isPending}
                    onClick={() =>
                      supportReplyMutation.mutate({ conversationId: supportConvId, message: supportReply.trim() })
                    }
                  >
                    {supportReplyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reply"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => refetchConversations()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {activeSection === "l1" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>L1 performance · Hyperliquid</CardTitle>
                  <CardDescription>Exchange-wide volume / OI and Equilibrium cohort signals</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchHl()} disabled={hlLoading}>
                  <RefreshCw className={cn("h-4 w-4", hlLoading && "animate-spin")} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {hlLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : hlAnalytics ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3 w-3" /> 24h perp notional (USD)
                      </div>
                      <p className="text-xl font-bold mt-1">
                        $
                        {Number(hlAnalytics.hyperliquid?.totalDayNotionalVolumeUsd || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-xs text-muted-foreground">Open interest (est. USD)</div>
                      <p className="text-xl font-bold mt-1">
                        $
                        {Number(hlAnalytics.hyperliquid?.totalOpenInterestUsd || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4 sm:col-span-2">
                      <div className="text-xs text-muted-foreground">Sovereign handshakes (app DB)</div>
                      <p className="text-xl font-bold mt-1">
                        {hlAnalytics.sovereignCohort?.instantTradingHandshakeComplete ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Builder-approved: {hlAnalytics.sovereignCohort?.builderCodeApproved ?? 0}
                      </p>
                    </div>
                  </div>
                ) : null}
                {hlAnalytics?.note && (
                  <p className="text-xs text-muted-foreground border-t pt-3">{hlAnalytics.note}</p>
                )}
              </CardContent>
            </Card>
          </div>
          )}

          </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-500 animate-pulse" />
              Live log
            </CardTitle>
            <CardDescription className="text-xs">Support, Telegram, and API events (WebSocket).</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[min(60vh,520px)] rounded-md border bg-black/40 font-mono text-[10px] p-2">
              {logLines.length === 0 ? (
                <p className="text-muted-foreground">Waiting for events…</p>
              ) : (
                logLines.map((line, i) => (
                  <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-all border-b border-border/30 py-0.5">
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      </div>

      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent data-testid="modal-edit-subscription">
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>Update plan for this wallet</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-6 py-4">
              <div>
                <Label className="text-muted-foreground">Wallet</Label>
                <p className="font-mono text-sm mt-1">{editingUser.walletAddress}</p>
              </div>
              {editingUser.email && (
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="text-sm mt-1">{editingUser.email}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={editTier} onValueChange={(v) => setEditTier(v as TierEdit)}>
                  <SelectTrigger data-testid="select-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Free
                      </div>
                    </SelectItem>
                    <SelectItem value="pro">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Pro — ${PRO_MONTHLY_USD}/mo
                      </div>
                    </SelectItem>
                    <SelectItem value="mentoring">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                        Mentoring — ${MENTORING_MONTHLY_USD}/mo
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Subscription active</Label>
                  <p className="text-sm text-muted-foreground">Toggle access</p>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} data-testid="switch-active" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveSubscription} disabled={updateSubscriptionMutation.isPending} data-testid="button-save-subscription">
                  {updateSubscriptionMutation.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
