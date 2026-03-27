import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import axios, { type AxiosInstance } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Shield,
  MessageSquare,
  Loader2,
  RefreshCw,
  Search,
  MessageCircle,
  ExternalLink,
  Video,
  Trash2,
  Plus,
  Eye,
  FileDown,
  Upload,
} from "lucide-react";
import type { WalletUser, SupportMessage, TutorialVideo } from "@shared/schema";
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
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { TIER_PRO } from "@/lib/subscription-pricing";
import { parseVideosApiList } from "@/lib/video-vault";
import { cn } from "@/lib/utils";
import { linkifyPlainText } from "@/lib/linkify-message";

const VAULT_CATEGORY_PRESETS = ["Beginner Patterns", "SMA Masterclass", "Live Trading Sessions"] as const;

type TabKey = "users" | "support" | "videos";

const MASTER_PANEL_STORAGE_KEY = "equilibrium_command_center_master_wallet";

function isValidHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
        config.headers.Authorization = `Bearer ${address}`;
      }
      return config;
    });
    return client;
  }, [address]);
}

function displaySubTier(tier: string | undefined): string {
  const t = (tier || "free").toLowerCase();
  if (t === "mentoring" || t === "elite") return "Mentor";
  if (t === "pro") return "Pro";
  return "Free";
}

function conversationParticipantWallet(msgs: SupportMessage[]): string {
  for (const m of msgs) {
    if (m.senderType === "user") {
      const w = (m.walletAddress || m.senderWallet || "").trim();
      if (w) return w;
    }
  }
  const cid = (msgs[0]?.conversationId || "").trim();
  if (/^0x[a-fA-F0-9]{40}$/i.test(cid)) return cid;
  return cid || "—";
}

function exportUsersToCsv(rows: WalletUser[], filename = "equilibrium-crm-export.csv") {
  const header = ["Wallet", "Email", "Join date", "Sub tier"];
  const lines = [
    header.join(","),
    ...rows.map((u) => {
      const join =
        u.createdAt != null
          ? new Date(u.createdAt as unknown as string).toISOString().slice(0, 10)
          : "";
      const tier = displaySubTier(u.subscriptionTier ?? undefined);
      const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
      return [esc(u.walletAddress), esc(u.email || ""), esc(join), esc(tier)].join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const { address } = useWallet();
  const { openSupportInbox } = useChat();
  const { isMasterAdmin, masterConfigured, isLoading: adminCheckLoading } = useIsMasterAdmin();
  const { isAdmin: isAppAdmin, isLoading: appAdminLoading } = useIsAdmin();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const api = useAdminApi(address ?? undefined);
  const [tab, setTab] = useState<TabKey>("users");
  const [search, setSearch] = useState("");
  const [replyConv, setReplyConv] = useState("");
  const [replyText, setReplyText] = useState("");
  const [vaultTitle, setVaultTitle] = useState("");
  const [vaultDescription, setVaultDescription] = useState("");
  const [vaultCategory, setVaultCategory] = useState("SMA Masterclass");
  const [vaultUrl, setVaultUrl] = useState("");
  const [vaultThumb, setVaultThumb] = useState("");
  const [vaultSearch, setVaultSearch] = useState("");
  /** Absolute URL after local upload (`/api/uploads/files/…` on this origin). */
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedFileLabel, setUploadedFileLabel] = useState("");
  const vaultFileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading: isVaultFileUploading, error: vaultUploadError } = useUpload();

  /** Master: full CRM + videos. App admins (`ADMIN_WALLET_ADDRESSES`): videos when master is set, or full entry if master env unset. */
  const showCrmTabs = isMasterAdmin;
  const canManageVideos = isMasterAdmin || isAppAdmin;
  const canAccessCommandCenter =
    !!address &&
    ((masterConfigured && (isMasterAdmin || isAppAdmin)) || (!masterConfigured && isAppAdmin));
  const accessGateLoading =
    adminCheckLoading || (!!address && !isMasterAdmin && appAdminLoading);

  useEffect(() => {
    if (address && isMasterAdmin) {
      try {
        localStorage.setItem(MASTER_PANEL_STORAGE_KEY, address.toLowerCase());
      } catch {
        /* ignore quota / private mode */
      }
    }
  }, [address, isMasterAdmin]);

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-rest", "admin-users", address],
    enabled: !!address && isMasterAdmin,
    queryFn: async () => {
      const { data, status } = await api.get<WalletUser[]>("/api/admin/users");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load users");
      return data;
    },
  });

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMessages } = useQuery({
    queryKey: ["admin-rest", "messages", address],
    enabled: !!address && isMasterAdmin && tab === "support",
    refetchInterval: tab === "support" ? 2500 : false,
    queryFn: async () => {
      const { data, status } = await api.get<SupportMessage[]>("/api/support", { params: { limit: 800 } });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load messages");
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: vaultVideos = [], isLoading: vaultLoading, refetch: refetchVault } = useQuery({
    queryKey: ["admin-rest", "vault-videos", address],
    enabled: !!address && canManageVideos && tab === "videos",
    queryFn: async () => {
      const { data, status } = await api.get<unknown>("/api/videos");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load videos");
      return parseVideosApiList(data);
    },
  });

  useEffect(() => {
    if (!address || !isMasterAdmin || tab !== "support") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/ws/support-chat`);
      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            type: "subscribe",
            scope: "admin_inbox",
            walletAddress: address,
          }),
        );
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { type?: string; message?: { id?: string } };
          if (data?.type === "support_message" && data?.message?.id) {
            void queryClient.invalidateQueries({ queryKey: ["admin-rest", "messages", address] });
            void queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
    return () => {
      ws?.close();
    };
  }, [address, isMasterAdmin, tab, queryClient]);

  useLayoutEffect(() => {
    if (!showCrmTabs) {
      setTab("videos");
    }
  }, [showCrmTabs]);

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

  const filteredVaultVideos = useMemo(() => {
    const q = vaultSearch.trim().toLowerCase();
    if (!q) return vaultVideos;
    return vaultVideos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.youtubeId && v.youtubeId.toLowerCase().includes(q)) ||
        (v.videoPath && v.videoPath.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q)),
    );
  }, [vaultVideos, vaultSearch]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.walletAddress.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q)),
    );
  }, [users, search]);

  const grantProMutation = useMutation({
    mutationFn: async (wallet: string) => {
      const enc = encodeURIComponent(wallet);
      const { data, status } = await api.patch(`/api/users/${enc}/subscription`, { isSubscribed: true });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) throw new Error((data as { error?: string })?.error || "Update failed");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rest", "admin-users"] });
      toast({ title: "Pro granted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeProMutation = useMutation({
    mutationFn: async (wallet: string) => {
      const enc = encodeURIComponent(wallet);
      const { data, status } = await api.patch(`/api/users/${enc}/subscription`, { removePro: true });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) throw new Error((data as { error?: string })?.error || "Update failed");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rest", "admin-users"] });
      toast({ title: "Pro removed", description: "User set to Free (manual override cleared)." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleVaultVideoFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const okType =
        /^video\//.test(file.type) ||
        /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
      if (!okType) {
        toast({
          title: "Unsupported file",
          description: "Use a video file such as MP4, WebM, or MOV.",
          variant: "destructive",
        });
        return;
      }
      const res = await uploadFile(file);
      if (res?.objectPath) {
        const abs = `${window.location.origin}${res.objectPath}`;
        setUploadedVideoUrl(abs);
        setUploadedFileLabel(file.name);
        setVaultUrl("");
        toast({
          title: "Upload complete",
          description: `${file.name} is ready. Add title and click Add video, or paste a YouTube/Vimeo URL instead.`,
        });
      }
    },
    [uploadFile, toast],
  );

  const addVaultVideo = useMutation({
    mutationFn: async () => {
      if (!vaultTitle.trim() || !vaultCategory.trim()) {
        throw new Error("Title and vault section are required");
      }
      const url = (uploadedVideoUrl || vaultUrl.trim()).trim();
      if (!url) {
        throw new Error("Upload a video file or paste a video URL (YouTube, Vimeo, or direct link)");
      }
      if (!isValidHttpUrl(url)) {
        throw new Error("Video address must be a valid http(s) URL");
      }
      const thumb = vaultThumb.trim();
      if (thumb && !isValidHttpUrl(thumb)) {
        throw new Error("Thumbnail must be a valid http(s) URL or left empty");
      }
      const desc = vaultDescription.trim() || vaultTitle.trim();
      const { data, status } = await api.post("/api/admin/videos", {
        title: vaultTitle.trim(),
        description: desc,
        videoUrl: url,
        thumbnailUrl: thumb || undefined,
        category: vaultCategory.trim(),
      });
      if (status === 401 || status === 403) {
        throw new Error((data as { error?: string })?.error || "Unauthorized");
      }
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Failed to add video");
      }
      return data;
    },
    onSuccess: () => {
      setVaultTitle("");
      setVaultDescription("");
      setVaultCategory("SMA Masterclass");
      setVaultUrl("");
      setVaultThumb("");
      setUploadedVideoUrl(null);
      setUploadedFileLabel("");
      void queryClient.invalidateQueries({ queryKey: ["admin-rest", "vault-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Video published", description: "Stored in the database video library." });
      void refetchVault();
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const deleteVaultVideo = useMutation({
    mutationFn: async (id: string) => {
      const { data, status } = await api.delete(`/api/admin/videos/${encodeURIComponent(id)}`);
      if (status === 401 || status === 403) {
        throw new Error((data as { error?: string })?.error || "Unauthorized");
      }
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Delete failed");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-rest", "vault-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Video removed" });
      void refetchVault();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
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
      toast({
        title: "Reply sent",
        description: "Delivered over WebSockets + SSE to the user’s chat bubble.",
      });
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

  if (accessGateLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (!address) {
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Equilibrium Command Center</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect an admin wallet: the address in{" "}
          <code className="text-xs bg-muted px-1 rounded">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> and/or{" "}
          <code className="text-xs bg-muted px-1 rounded">ADMIN_WALLET_ADDRESSES</code>.
        </p>
      </div>
    );
  }

  if (!canAccessCommandCenter) {
    if (!masterConfigured && !isAppAdmin) {
      return (
        <div className="p-8 max-w-lg">
          <h1 className="text-2xl font-semibold tracking-tight">Admin — not configured</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set <code className="text-xs bg-muted px-1 rounded">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> for the Command Center
            CRM, or add your wallet to <code className="text-xs bg-muted px-1 rounded">ADMIN_WALLET_ADDRESSES</code> for video
            tools.
          </p>
        </div>
      );
    }
    return (
      <div className="p-8 max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This wallet is not the master admin or an allowed admin address. CRM needs{" "}
          <code className="text-xs bg-muted px-1 rounded">ADMIN_EQUILIBRIUM_MASTER_WALLET</code> to match your address; video
          tools also accept <code className="text-xs bg-muted px-1 rounded">ADMIN_WALLET_ADDRESSES</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Command Center</h1>
            <p className="text-xs text-muted-foreground">
              {showCrmTabs
                ? `User CRM · Support Inbox · Video Manager · Manual Pro $${TIER_PRO}`
                : "Video Manager — add or remove vault lessons (CRM requires master wallet)."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showCrmTabs && (
            <Button variant="default" size="sm" className="shrink-0 gap-2" onClick={() => openSupportInbox()}>
              <MessageCircle className="h-4 w-4" />
              Open support inbox
            </Button>
          )}
          <Button variant="outline" size="sm" className="shrink-0 gap-2" asChild>
            <Link to="/videos" target="_blank" rel="noreferrer">
              <Eye className="h-4 w-4" />
              Open vault (new tab)
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <aside className="w-full md:w-52 shrink-0 space-y-1 rounded-xl border bg-card p-2">
              {showCrmTabs && (
            <>
              {nav("users", "User CRM", <Users className="h-4 w-4" />)}
              {nav("support", "Support Inbox", <MessageSquare className="h-4 w-4" />)}
            </>
          )}
          {nav("videos", "Video Manager", <Video className="h-4 w-4" />)}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          {tab === "users" && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>User CRM</CardTitle>
                  <CardDescription>
                    Emails and wallets from sign-up (<code className="text-[10px]">wallet_users</code>) — tier reflects Stripe +
                    manual override
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-8 h-9" placeholder="Search wallet or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => void refetchUsers()}
                    disabled={usersLoading}
                  >
                    <RefreshCw className={cn("h-4 w-4", usersLoading && "animate-spin")} />
                    Refresh
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={filteredUsers.length === 0}
                    onClick={() => {
                      exportUsersToCsv(filteredUsers);
                      toast({ title: "CSV exported", description: `${filteredUsers.length} row(s) in the download.` });
                    }}
                  >
                    <FileDown className="h-4 w-4" />
                    Export to CSV
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
                          <TableHead>Join date</TableHead>
                          <TableHead>Sub tier</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
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
                              <Badge variant="outline" className="text-xs">
                                {displaySubTier(u.subscriptionTier ?? undefined)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Open thread"
                                onClick={() => openSupportInbox(u.walletAddress.toLowerCase())}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 text-[10px]"
                                disabled={grantProMutation.isPending || removeProMutation.isPending}
                                onClick={() => grantProMutation.mutate(u.walletAddress)}
                              >
                                Grant Pro
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-[10px]"
                                disabled={grantProMutation.isPending || removeProMutation.isPending}
                                onClick={() => removeProMutation.mutate(u.walletAddress)}
                              >
                                Remove Pro
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
                    <CardTitle>Support Inbox</CardTitle>
                    <CardDescription>
                      Messages from the chat bubble are stored in <code className="text-[10px]">support_tickets</code>{" "}
                      and trigger Telegram when <code className="text-[10px]">TELEGRAM_BOT_TOKEN</code> +{" "}
                      <code className="text-[10px]">TELEGRAM_CHAT_ID</code> are set. Live updates: WebSocket + poll.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => void refetchMessages()}
                    disabled={msgLoading}
                  >
                    <RefreshCw className={cn("h-4 w-4", msgLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {msgLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <ScrollArea className="h-[360px] space-y-2">
                      {conversations.map(([cid, msgs]) => {
                        const participant = conversationParticipantWallet(msgs);
                        return (
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
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">User wallet</div>
                            <div className="font-mono truncate text-foreground" title={participant}>
                              {participant}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5" title={cid}>
                              Thread: {cid}
                            </div>
                            <div className="text-muted-foreground line-clamp-2 mt-1 break-all">
                              {msgs[msgs.length - 1]?.message
                                ? linkifyPlainText(
                                    msgs[msgs.length - 1]!.message,
                                    "text-primary underline-offset-2 hover:underline",
                                  )
                                : null}
                            </div>
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
                        );
                      })}
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Reply</CardTitle>
                  <CardDescription>
                    User messages arrive via Chat Support; ingest uses <code className="text-[10px]">POST /api/support/send</code>{" "}
                    (Telegram when configured). Replies use WebSocket + SSE.
                  </CardDescription>
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
                        <span className="text-[10px] text-muted-foreground">{m.senderType}</span> —{" "}
                        {linkifyPlainText(m.message, "text-primary underline-offset-2 hover:underline break-all")}
                      </div>
                    ))}
                  </ScrollArea>
                  <div className="space-y-1">
                    <Label className="text-xs">Reply</Label>
                    <Textarea
                      rows={4}
                      placeholder="Type a reply to this user…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" disabled={sendReply.isPending} onClick={() => sendReply.mutate()}>
                    {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reply"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === "videos" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add video</CardTitle>
                  <CardDescription>
                    Upload an MP4/WebM/MOV to the server (<code className="text-[10px]">/api/uploads</code>) or paste a URL, then{" "}
                    <code className="text-[10px]">POST /api/admin/videos</code>. Entries appear on{" "}
                    <strong>Videos</strong> (<Link to="/videos" className="text-primary underline-offset-2 hover:underline">Pro Educational Vault</Link>
                    ) for paying subscribers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-w-xl">
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input value={vaultTitle} onChange={(e) => setVaultTitle(e.target.value)} placeholder="Lesson title" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dash-vault-category">Vault section (category)</Label>
                    <Input
                      id="dash-vault-category"
                      list="dash-vault-category-presets"
                      value={vaultCategory}
                      onChange={(e) => setVaultCategory(e.target.value)}
                      placeholder="e.g. SMA Masterclass or your own course name"
                      maxLength={200}
                    />
                    <datalist id="dash-vault-category-presets">
                      {VAULT_CATEGORY_PRESETS.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <p className="text-[10px] text-muted-foreground">
                      Type any name — it becomes a section on <Link to="/videos" className="text-primary underline-offset-2 hover:underline">/videos</Link>.
                      Quick picks:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {VAULT_CATEGORY_PRESETS.map((p) => (
                        <Button key={p} type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setVaultCategory(p)}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Description (optional)</Label>
                    <Textarea
                      rows={2}
                      value={vaultDescription}
                      onChange={(e) => setVaultDescription(e.target.value)}
                      placeholder="Short summary — defaults to title if empty"
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <Label>Video source</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Use <strong>upload</strong> for files on this server, or <strong>URL</strong> for YouTube / Vimeo / hosted MP4.
                    </p>
                    <input
                      ref={vaultFileInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                      className="sr-only"
                      onChange={(ev: ChangeEvent<HTMLInputElement>) => void handleVaultVideoFile(ev)}
                    />
                    <div className="flex flex-wrap gap-2 items-center">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        disabled={isVaultFileUploading || addVaultVideo.isPending}
                        onClick={() => vaultFileInputRef.current?.click()}
                      >
                        {isVaultFileUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {isVaultFileUploading ? "Uploading…" : "Upload video file"}
                      </Button>
                      {uploadedVideoUrl && (
                        <>
                          <Badge variant="outline" className="text-[10px] font-normal max-w-[200px] truncate" title={uploadedFileLabel}>
                            File: {uploadedFileLabel || "uploaded"}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                              setUploadedVideoUrl(null);
                              setUploadedFileLabel("");
                            }}
                          >
                            Clear file
                          </Button>
                        </>
                      )}
                    </div>
                    {vaultUploadError && (
                      <p className="text-xs text-destructive">{vaultUploadError.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Video URL (optional if you uploaded)</Label>
                    <Input
                      value={vaultUrl}
                      onChange={(e) => {
                        setVaultUrl(e.target.value);
                        setUploadedVideoUrl(null);
                        setUploadedFileLabel("");
                      }}
                      placeholder="https://youtube.com/… or vimeo or .mp4"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Thumbnail URL (optional)</Label>
                    <Input
                      value={vaultThumb}
                      onChange={(e) => setVaultThumb(e.target.value)}
                      placeholder="https://…"
                      className="font-mono text-xs"
                    />
                  </div>
                  <Button
                    className="gap-2"
                    disabled={addVaultVideo.isPending || isVaultFileUploading}
                    onClick={() => addVaultVideo.mutate()}
                  >
                    {addVaultVideo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add video
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Library</CardTitle>
                    <CardDescription>Delete removes the row from the database immediately for all clients.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[160px] max-w-xs">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-8 h-9"
                        placeholder="Search…"
                        value={vaultSearch}
                        onChange={(e) => setVaultSearch(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={() => void refetchVault()}
                      disabled={vaultLoading}
                    >
                      <RefreshCw className={cn("h-4 w-4", vaultLoading && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {vaultLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <ScrollArea className="h-[min(50vh,420px)]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>URL</TableHead>
                            <TableHead className="text-right w-[100px]">Delete</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vaultVideos.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                                No rows yet — add a video above.
                              </TableCell>
                            </TableRow>
                          ) : filteredVaultVideos.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                                No videos match your search.
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredVaultVideos.map((v) => (
                              <TableRow key={v.id}>
                                <TableCell className="max-w-[200px]">
                                  <div className="font-medium text-sm line-clamp-2">{v.title}</div>
                                </TableCell>
                                <TableCell className="text-xs max-w-[120px]">{v.category}</TableCell>
                                <TableCell className="text-[10px] font-mono max-w-[200px] truncate" title={v.videoPath || (v.youtubeId ? `https://youtube.com/watch?v=${v.youtubeId}` : "")}>
                                  {v.youtubeId ? `youtube:${v.youtubeId}` : v.videoPath || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="gap-1 h-8"
                                    disabled={deleteVaultVideo.isPending}
                                    onClick={() => {
                                      if (confirm(`Remove “${v.title}” from the library?`)) {
                                        deleteVaultVideo.mutate(v.id);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
