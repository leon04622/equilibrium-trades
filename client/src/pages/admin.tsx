import { useState, useEffect, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PRO_MONTHLY_USD, MENTORING_MONTHLY_USD } from "@/lib/subscription-pricing";

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
    refetchInterval: 12_000,
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

  if (!address) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
            <p className="text-muted-foreground">Connect your wallet to open the Command Center.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (masterLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span>Checking access…</span>
      </div>
    );
  }

  if (!masterConfigured) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Command Center Unavailable</h2>
            <p className="text-muted-foreground">
              Set <code className="text-xs">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> on the server to your operations wallet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isMasterAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Only the configured master admin wallet may open the Equilibrium Command Center.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Equilibrium Command Center</h1>
        </div>
        <p className="text-muted-foreground">
          CRM, support tickets, L1 analytics — master wallet only. Pro ${PRO_MONTHLY_USD}/mo · Mentoring ${MENTORING_MONTHLY_USD}/mo (includes Pro).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,340px)]">
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="users" className="gap-1.5" data-testid="tab-users">
              <Users className="h-4 w-4" />
              Users (CRM)
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-1.5" data-testid="tab-support">
              <MessageCircle className="h-4 w-4" />
              Support Tickets
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5" data-testid="tab-analytics">
              <BarChart3 className="h-4 w-4" />
              L1 Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4 mt-4">
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
                          <TableHead>Plan</TableHead>
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
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getTierIcon(user.subscriptionTier)}
                                <span className="capitalize text-xs">
                                  {user.subscriptionTier === "pro" ? "Pro" : user.subscriptionTier === "mentoring" ? "Mentoring" : user.subscriptionTier}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getTierBadge(user.subscriptionTier, user.subscriptionActive)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => handleEditUser(user)} data-testid={`button-edit-${user.id}`}>
                                Edit
                              </Button>
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
          </TabsContent>

          <TabsContent value="support" className="space-y-4 mt-4">
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
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Hyperliquid L1 + cohort</CardTitle>
                  <CardDescription>Public exchange aggregates and in-app sovereign counts</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchHl()} disabled={hlLoading}>
                  <RefreshCw className={cn("h-4 w-4", hlLoading && "animate-spin")} />
                </Button>
              </CardHeader>
              <CardContent>
                {hlLoading ? (
                  <p className="text-muted-foreground">Loading…</p>
                ) : (
                  <pre className="text-xs bg-muted/40 rounded-md p-3 overflow-x-auto max-h-[480px]">
                    {JSON.stringify(hlAnalytics, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
