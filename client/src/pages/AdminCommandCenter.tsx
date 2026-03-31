import { useMemo, useState, useCallback, useEffect, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import axios, { type AxiosInstance } from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Video,
  Users,
  ArrowUpDown,
  Shield,
  Upload,
  MessageSquare,
  Activity,
  Check,
  Download,
} from "lucide-react";
import type { TutorialVideo, SupportMessage } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
import { useUpload } from "@/hooks/use-upload";
import { parseVideosApiList } from "@/lib/video-vault";
import { FORTRESS_SOVEREIGN_WALLET } from "@/lib/fortress-admin";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { linkifyPlainText } from "@/lib/linkify-message";
import { CrmJournalInsightsDialog } from "@/components/crm-journal-insights-dialog";
import { StatePanel } from "@/components/state-panel";
import { crmUsersToCsv } from "@/lib/csv-export";

const VAULT_CATEGORY_PRESETS = ["Beginner Patterns", "SMA Masterclass", "Live Trading Sessions"] as const;

type CrmRow = {
  wallet: string;
  email: string | null;
  referralWallet?: string | null;
  joinDate: string | null;
  subTier: string;
  status?: string;
  manualProOverride?: boolean;
  builderStatus?: string;
};

type SortKey =
  | "wallet"
  | "email"
  | "referralWallet"
  | "joinDate"
  | "subTier"
  | "status"
  | "builderStatus";

type ScannerHealthSnapshot = {
  monitoringEnabled: boolean;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  lastTimeframes: string[];
  totalCoinsPlanned: number;
  coinsCompleted: number;
  signalsEmitted: number;
  gold1mLagMs: number | null;
  alt1mThinOrEmpty: number;
  errors: { coin: string; phase: string; message: string }[];
  statusSummary: string;
};

function useSovereignApi(address: string | null | undefined): AxiosInstance {
  return useMemo(() => {
    const client = axios.create({
      baseURL: "/",
      headers: { "Content-Type": "application/json" },
      /** So 4xx/5xx still return `data` — we parse errors in each mutation (axios default hides body on 500). */
      validateStatus: () => true,
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

function sortCrmRows(rows: CrmRow[], key: SortKey, dir: "asc" | "desc"): CrmRow[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let va: string;
    let vb: string;
    if (key === "joinDate") {
      va = a.joinDate || "";
      vb = b.joinDate || "";
      return va.localeCompare(vb) * mult;
    }
    if (key === "status") {
      va = (a.status || "").toLowerCase();
      vb = (b.status || "").toLowerCase();
      return va.localeCompare(vb) * mult;
    }
    if (key === "builderStatus") {
      va = (a.builderStatus || "").toLowerCase();
      vb = (b.builderStatus || "").toLowerCase();
      return va.localeCompare(vb) * mult;
    }
    if (key === "referralWallet") {
      va = (a.referralWallet || "").toLowerCase();
      vb = (b.referralWallet || "").toLowerCase();
      return va.localeCompare(vb) * mult;
    }
    va = String(a[key as "wallet" | "email" | "subTier"] ?? "").toLowerCase();
    vb = String(b[key as "wallet" | "email" | "subTier"] ?? "").toLowerCase();
    return va.localeCompare(vb) * mult;
  });
}

export default function AdminCommandCenter() {
  const { address } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const api = useSovereignApi(address);
  const { uploadFile, isUploading: isVideoFileUploading, error: videoUploadHookError } = useUpload();

  const [tab, setTab] = useState("crm");
  /** CRM row wallet — opens journal insights dialog */
  const [journalInsightsWallet, setJournalInsightsWallet] = useState<string | null>(null);
  const [crmSearch, setCrmSearch] = useState("");
  const [crmSort, setCrmSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "joinDate",
    dir: "desc",
  });
  const [accessSavedWallet, setAccessSavedWallet] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("SMA Masterclass");
  const [description, setDescription] = useState("");
  /** Playable URL after upload (absolute) or optional direct https MP4. */
  const [videoPlayUrl, setVideoPlayUrl] = useState("");
  const [uploadedFileLabel, setUploadedFileLabel] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const { data: crmUsers = [], isLoading: crmLoading, isError: crmError, error: crmErrorObj, refetch: refetchCrm } = useQuery({
    queryKey: ["fortress-crm-users", address],
    enabled: !!address,
    queryFn: async () => {
      const { data, status } = await api.get<CrmRow[]>("/api/crm/users");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200 || !Array.isArray(data)) throw new Error("Failed to load CRM");
      return data;
    },
  });

  const filteredCrm = useMemo(() => {
    const q = crmSearch.trim().toLowerCase();
    if (!q) return crmUsers;
    return crmUsers.filter(
      (r) =>
        r.wallet.toLowerCase().includes(q) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.referralWallet && r.referralWallet.toLowerCase().includes(q)) ||
        (r.subTier && r.subTier.toLowerCase().includes(q)) ||
        (r.builderStatus && r.builderStatus.toLowerCase().includes(q)),
    );
  }, [crmUsers, crmSearch]);

  const sortedCrm = useMemo(
    () => sortCrmRows(filteredCrm, crmSort.key, crmSort.dir),
    [filteredCrm, crmSort],
  );

  const exportCrmCsv = useCallback(() => {
    if (sortedCrm.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Load CRM data or adjust your search filter.",
        variant: "destructive",
      });
      return;
    }
    const csv = crmUsersToCsv(sortedCrm);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equilibrium-crm-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "CRM exported",
      description: `${sortedCrm.length} row(s) — reflects current sort and search.`,
    });
  }, [sortedCrm, toast]);

  const manualProMutation = useMutation({
    mutationFn: async ({ wallet, enable }: { wallet: string; enable: boolean }) => {
      const { data, status } = await api.patch("/api/admin/update-tier", {
        walletAddress: wallet.trim(),
        newTier: enable ? "Pro" : "Free",
      });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Update failed");
      }
      return data;
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["fortress-crm-users"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-status"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stripe/subscription"] });
      toast({
        title: "User updated",
        description: vars.enable ? "Pro access saved to the database." : "User set to Free in the database.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setAccessMutation = useMutation({
    mutationFn: async ({ wallet, targetTier }: { wallet: string; targetTier: "Pro" | "Mentor" | "Free" }) => {
      const { data, status } = await api.patch("/api/admin/set-access", {
        walletAddress: wallet.trim(),
        targetTier,
      });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Failed to save access");
      }
      return { wallet };
    },
    onSuccess: ({ wallet }) => {
      setAccessSavedWallet(wallet);
      window.setTimeout(() => {
        setAccessSavedWallet((w) => (w === wallet ? null : w));
      }, 3500);
      void queryClient.invalidateQueries({ queryKey: ["fortress-crm-users"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user/sync"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-status"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/stripe/subscription"] });
      void queryClient.refetchQueries({ queryKey: ["/api/user/sync"] });
      void queryClient.refetchQueries({ queryKey: ["/api/user-status"] });
      toast({
        title: "Access saved",
        description: "Tier written to the database (Postgres + CRM sync).",
        className:
          "border-emerald-500/55 bg-emerald-950/95 text-emerald-50 shadow-lg shadow-emerald-900/20",
      });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const {
    data: supportFeed = [],
    isLoading: supportLoading,
    isError: supportError,
    error: supportErrorObj,
    refetch: refetchSupport,
  } = useQuery({
    queryKey: ["fortress-support-feed", address],
    enabled: !!address && tab === "support",
    refetchInterval: tab === "support" ? 4000 : false,
    queryFn: async () => {
      const { data, status } = await api.get<SupportMessage[]>("/api/support", { params: { limit: 800 } });
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load support");
      return Array.isArray(data) ? data : [];
    },
  });

  useEffect(() => {
    if (!address || tab !== "support") return;
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
            void queryClient.invalidateQueries({ queryKey: ["fortress-support-feed"] });
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
  }, [address, tab, queryClient]);

  const toggleSort = (key: SortKey) => {
    setCrmSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const {
    data: videos = [],
    isLoading: videosLoading,
    isError: videosError,
    error: videosErrorObj,
    refetch: refetchVideos,
  } = useQuery({
    queryKey: ["fortress-videos", address],
    enabled: !!address,
    queryFn: async () => {
      const { data, status } = await api.get<unknown>("/api/videos");
      if (status !== 200) throw new Error("Failed to load videos");
      return parseVideosApiList(data);
    },
  });

  const clearVideoForm = useCallback(() => {
    setTitle("");
    setCategory("SMA Masterclass");
    setDescription("");
    setVideoPlayUrl("");
    setUploadedFileLabel("");
    setThumbnailUrl("");
  }, []);

  const handleVideoFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const okType =
        /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
      if (!okType) {
        toast({
          title: "Unsupported file",
          description: "Use MP4, WebM, or MOV.",
          variant: "destructive",
        });
        return;
      }
      const res = await uploadFile(file);
      if (res?.objectPath) {
        const abs = `${window.location.origin}${res.objectPath}`;
        setVideoPlayUrl(abs);
        setUploadedFileLabel(file.name);
        toast({
          title: "Upload complete",
          description: `${file.name} is ready. Add a title and click Save to library.`,
        });
      } else {
        toast({
          title: "Upload failed",
          description:
            "The file did not upload. Use the same site URL as your API (not a separate dev port) and confirm /api/uploads works.",
          variant: "destructive",
        });
      }
    },
    [uploadFile, toast],
  );

  const addVideo = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const url = videoPlayUrl.trim();
      if (!url) throw new Error("Upload a video file first (MP4 / WebM / MOV).");
      const { data, status } = await api.post("/api/videos", {
        title: title.trim(),
        category: category.trim(),
        description: description.trim() || title.trim(),
        videoUrl: url,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
      });
      if (status === 401 || status === 403) {
        throw new Error((data as { error?: string })?.error || "Unauthorized");
      }
      if (status < 200 || status >= 300) {
        const body = data as { error?: string; detail?: string; details?: unknown };
        let msg =
          (typeof body?.detail === "string" && body.detail) ||
          body?.error ||
          `Save failed (${status})`;
        if (body?.details != null) {
          msg += ` — ${typeof body.details === "string" ? body.details : JSON.stringify(body.details)}`;
        }
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      clearVideoForm();
      void queryClient.invalidateQueries({ queryKey: ["fortress-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({
        title: "Video saved to MongoDB",
        description: "Write acknowledged (majority). It will appear on /videos after list refresh.",
        className:
          "border-emerald-500/55 bg-emerald-950/95 text-emerald-50 shadow-lg shadow-emerald-900/20",
      });
      void refetchVideos();
    },
  });

  const saveVideoToLibrary = async () => {
    try {
      await addVideo.mutateAsync();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const {
    data: scannerHealth,
    isLoading: scannerHealthLoading,
    isError: scannerHealthError,
    error: scannerHealthErrObj,
    refetch: refetchScannerHealth,
  } = useQuery({
    queryKey: ["fortress-scanner-health", address],
    enabled: !!address && tab === "scanner",
    refetchInterval: tab === "scanner" ? 12_000 : false,
    queryFn: async () => {
      const { data, status } = await api.get<ScannerHealthSnapshot>("/api/admin/scanner-health");
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load scanner health");
      return data;
    },
  });

  const scannerMonitoringMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, status } = await api.post<{ ok?: boolean; enabled?: boolean }>(
        "/api/admin/scanner-health/monitoring",
        { enabled },
      );
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Update failed");
      }
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fortress-scanner-health"] });
      toast({
        title: "Scanner health",
        description: "Monitoring flag updated. Run a pattern scan (Signals page) to record metrics.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeVideo = useMutation({
    mutationFn: async (id: string) => {
      const { data, status } = await api.delete(`/api/videos/${encodeURIComponent(id)}`);
      if (status < 200 || status >= 300) {
        throw new Error((data as { error?: string })?.error || "Delete failed");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fortress-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Removed", description: "Video deleted from the database." });
      void refetchVideos();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 pb-24 md:pb-8">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-primary">
                <Shield className="h-6 w-6" />
                <span className="text-xs font-semibold uppercase tracking-wider">Fortress</span>
              </div>
              <h1 className="text-2xl font-bold font-display tracking-tight md:text-3xl">Admin Command Center</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Internal control surface for member access, premium vault publishing, support operations, and scanner
                health across the live platform.
              </p>
              <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground/80">{FORTRESS_SOVEREIGN_WALLET}</p>
            </div>
            <Button variant="outline" size="sm" asChild className="bg-background/80">
              <Link to="/">← Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-4xl gap-1">
          <TabsTrigger value="crm" className="gap-1.5">
            <Users className="h-4 w-4 shrink-0" />
            Live CRM
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-1.5">
            <Video className="h-4 w-4 shrink-0" />
            Videos
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <MessageSquare className="h-4 w-4 shrink-0" />
            Support
          </TabsTrigger>
          <TabsTrigger value="scanner" className="gap-1.5">
            <Activity className="h-4 w-4 shrink-0" />
            Scanner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crm">
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Live CRM</CardTitle>
                <CardDescription>
                  MongoDB users collection (or Postgres wallet_users) — wallet, email, tier, subscription status.
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => exportCrmCsv()}
                  disabled={crmLoading || !!crmError}
                  aria-label="Export CRM as CSV"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button variant="ghost" size="icon" onClick={() => void refetchCrm()} aria-label="Refresh CRM">
                  <RefreshCw className={cn("h-4 w-4", crmLoading && "animate-spin")} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-md space-y-2">
                <Label htmlFor="crm-search">Search</Label>
                <Input
                  id="crm-search"
                  placeholder="Wallet or email…"
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                />
              </div>
              {crmError ? (
                <StatePanel
                  icon={<Users className="h-6 w-6" />}
                  title="CRM could not be loaded"
                  description={crmErrorObj instanceof Error ? crmErrorObj.message : String(crmErrorObj)}
                  actionLabel="Retry"
                  onAction={() => void refetchCrm()}
                  className="shadow-none"
                  contentClassName="min-h-[240px]"
                />
              ) : crmLoading ? (
                <StatePanel
                  loading
                  icon={<Loader2 className="h-6 w-6" />}
                  title="Loading CRM"
                  description="Fetching wallets, tiers, builder status, and member records from the live backend."
                  className="shadow-none"
                  contentClassName="min-h-[240px]"
                />
              ) : (
                <ScrollArea className="h-[min(520px,60vh)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("wallet")}
                          >
                            Wallet
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("email")}
                          >
                            Email
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("referralWallet")}
                          >
                            Referral
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("joinDate")}
                          >
                            Join date
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("subTier")}
                          >
                            Tier
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("status")}
                          >
                            Status
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-medium hover:text-primary"
                            onClick={() => toggleSort("builderStatus")}
                          >
                            Builder status
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap min-w-[140px]">Grant access</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Manual Pro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCrm.map((row) => {
                        const manualOn = !!row.manualProOverride;
                        const showSaved = accessSavedWallet === row.wallet;
                        return (
                          <TableRow key={row.wallet}>
                            <TableCell className="font-mono text-xs align-top break-all max-w-[180px]">
                              <button
                                type="button"
                                className="text-left text-primary hover:underline break-all"
                                onClick={() => setJournalInsightsWallet(row.wallet)}
                              >
                                {row.wallet}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm align-top">{row.email || "—"}</TableCell>
                            <TableCell className="font-mono text-[10px] align-top break-all max-w-[140px] text-muted-foreground">
                              {row.referralWallet || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                              {row.joinDate ? new Date(row.joinDate).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="secondary" className="text-xs">
                                {row.subTier || "Free"}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top text-xs">{row.status ?? "—"}</TableCell>
                            <TableCell className="align-top text-xs">
                              {row.builderStatus === "Linked" ? (
                                <Badge variant="default" className="text-[10px] bg-emerald-600/90">
                                  Linked
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">{row.builderStatus ?? "Not linked"}</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-right">
                              {showSaved ? (
                                <span className="inline-flex items-center justify-end gap-1 text-emerald-500 text-xs font-medium">
                                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                                  Saved
                                </span>
                              ) : (
                                <div className="flex flex-wrap justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={setAccessMutation.isPending}
                                    onClick={() => setAccessMutation.mutate({ wallet: row.wallet, targetTier: "Pro" })}
                                  >
                                    Pro
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={setAccessMutation.isPending}
                                    onClick={() =>
                                      setAccessMutation.mutate({ wallet: row.wallet, targetTier: "Mentor" })
                                    }
                                  >
                                    Mentor
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    disabled={setAccessMutation.isPending}
                                    onClick={() => setAccessMutation.mutate({ wallet: row.wallet, targetTier: "Free" })}
                                  >
                                    Free
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-right">
                              <Switch
                                checked={manualOn}
                                disabled={manualProMutation.isPending}
                                onCheckedChange={(enable) => {
                                  manualProMutation.mutate(
                                    { wallet: row.wallet, enable },
                                    {
                                      onError: (err: Error) =>
                                        toast({
                                          title: "Update failed",
                                          description: err.message,
                                          variant: "destructive",
                                        }),
                                    },
                                  );
                                }}
                                aria-label={`Manual Pro for ${row.wallet.slice(0, 8)}`}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="videos" className="space-y-6">
          <Card className="border-border/80 bg-card/50">
            <CardHeader>
              <CardTitle>Add video</CardTitle>
              <CardDescription>
                Upload an MP4, WebM, or MOV — files are stored on this server under{" "}
                <code className="text-xs">/api/uploads/files/…</code> and saved to the library.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="v-title">Title</Label>
                <Input
                  id="v-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Lesson title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-category">Category / vault section</Label>
                <Input
                  id="v-category"
                  list="vault-category-presets"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. SMA Masterclass or your own course name"
                  maxLength={200}
                />
                <datalist id="vault-category-presets">
                  {VAULT_CATEGORY_PRESETS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Type any section title — each unique name becomes its own group on{" "}
                  <Link to="/videos" className="text-primary underline-offset-2 hover:underline">
                    /videos
                  </Link>
                  . Quick picks:
                </p>
                <div className="flex flex-wrap gap-2">
                  {VAULT_CATEGORY_PRESETS.map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setCategory(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-desc">Description</Label>
                <Textarea
                  id="v-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — defaults to title"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Video file</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="v-file"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.m4v,.ogv"
                    className="max-w-xs cursor-pointer"
                    disabled={isVideoFileUploading || addVideo.isPending}
                    onChange={(e) => void handleVideoFile(e)}
                  />
                  {isVideoFileUploading ? (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </span>
                  ) : uploadedFileLabel ? (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadedFileLabel}
                    </span>
                  ) : null}
                </div>
                {videoUploadHookError ? (
                  <p className="text-xs text-destructive">{videoUploadHookError.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    After upload, the lesson uses a direct link to your file on this site (not embedded from elsewhere).
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="v-thumb">Thumbnail image URL (optional)</Label>
                <Input
                  id="v-thumb"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  placeholder="https://… (optional cover image)"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!videoPlayUrl.trim()}
                  onClick={() => {
                    setVideoPlayUrl("");
                    setUploadedFileLabel("");
                  }}
                >
                  Clear uploaded file
                </Button>
                <Button
                  onClick={() => void saveVideoToLibrary()}
                  disabled={addVideo.isPending || isVideoFileUploading}
                  className="gap-2"
                >
                  {addVideo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save to library
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Published lessons</CardTitle>
                <CardDescription>From GET /api/videos — visible on /videos (grouped by category)</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void refetchVideos()} aria-label="Refresh">
                <RefreshCw className={cn("h-4 w-4", videosLoading && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent>
              {videosError ? (
                <StatePanel
                  icon={<Video className="h-6 w-6" />}
                  title="Published lessons could not be loaded"
                  description={videosErrorObj instanceof Error ? videosErrorObj.message : String(videosErrorObj)}
                  actionLabel="Retry"
                  onAction={() => void refetchVideos()}
                  className="shadow-none"
                  contentClassName="min-h-[220px]"
                />
              ) : videosLoading ? (
                <StatePanel
                  loading
                  icon={<Loader2 className="h-6 w-6" />}
                  title="Loading vault catalogue"
                  description="Syncing the current premium lesson library from the live content store."
                  className="shadow-none"
                  contentClassName="min-h-[220px]"
                />
              ) : videos.length === 0 ? (
                <StatePanel
                  icon={<Video className="h-6 w-6" />}
                  title="No lessons published yet"
                  description="Upload your first vault lesson above and it will appear here immediately for review."
                  className="shadow-none"
                  contentClassName="min-h-[220px]"
                />
              ) : (
                <ScrollArea className="h-[min(420px,50vh)] pr-3">
                  <ul className="space-y-2">
                    {videos.map((v: TutorialVideo) => (
                      <li
                        key={v.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm leading-snug truncate">{v.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{v.category}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => removeVideo.mutate(v.id)}
                          disabled={removeVideo.isPending}
                          aria-label="Delete video"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support" className="space-y-4">
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Support feed</CardTitle>
                <CardDescription>
                  All messages from the Chat Support bubble — stored in MongoDB or Postgres (no third-party inbox).
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void refetchSupport()} aria-label="Refresh support">
                <RefreshCw className={cn("h-4 w-4", supportLoading && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent>
              {supportError ? (
                <StatePanel
                  icon={<MessageSquare className="h-6 w-6" />}
                  title="Support feed could not be loaded"
                  description={supportErrorObj instanceof Error ? supportErrorObj.message : String(supportErrorObj)}
                  actionLabel="Retry"
                  onAction={() => void refetchSupport()}
                  className="shadow-none"
                  contentClassName="min-h-[240px]"
                />
              ) : supportLoading ? (
                <StatePanel
                  loading
                  icon={<Loader2 className="h-6 w-6" />}
                  title="Loading support feed"
                  description="Bringing in the latest member conversations and replies."
                  className="shadow-none"
                  contentClassName="min-h-[240px]"
                />
              ) : supportFeed.length === 0 ? (
                <StatePanel
                  icon={<MessageSquare className="h-6 w-6" />}
                  title="Support inbox is quiet"
                  description="New member questions from the chat bubble will appear here automatically."
                  className="shadow-none"
                  contentClassName="min-h-[240px]"
                />
              ) : (
                <ScrollArea className="h-[min(560px,65vh)] pr-3">
                  <ul className="space-y-3">
                    {supportFeed.map((m) => (
                      <li key={m.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">
                            {m.senderType}
                          </Badge>
                          <span>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">{m.conversationId}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          {linkifyPlainText(m.message, "text-primary underline-offset-2 hover:underline break-all")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scanner" className="space-y-4">
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Scanner health</CardTitle>
                <CardDescription>
                  Toggle telemetry for the educational pattern scanner (1m gold lag, alt thin data, API errors). Open the
                  Signals page or wait for auto-refresh to run a scan after enabling.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void refetchScannerHealth()} aria-label="Refresh health">
                <RefreshCw className={cn("h-4 w-4", scannerHealthLoading && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {scannerHealthError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm space-y-2">
                  <p className="font-medium text-destructive">Could not load scanner health</p>
                  <p className="text-muted-foreground">
                    {scannerHealthErrObj instanceof Error ? scannerHealthErrObj.message : String(scannerHealthErrObj)}
                  </p>
                </div>
              ) : scannerHealthLoading && !scannerHealth ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="scanner-health-monitoring"
                        checked={scannerHealth?.monitoringEnabled ?? false}
                        disabled={scannerMonitoringMutation.isPending}
                        onCheckedChange={(v) => scannerMonitoringMutation.mutate(v)}
                      />
                      <Label htmlFor="scanner-health-monitoring" className="text-sm font-medium cursor-pointer">
                        Record metrics on each pattern scan
                      </Label>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-4 space-y-2 text-sm">
                    <p className="font-medium">{scannerHealth?.statusSummary ?? "—"}</p>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground font-mono">
                      <div>
                        <dt className="inline text-foreground/80">Last scan</dt>{" "}
                        <dd className="inline">
                          {scannerHealth?.lastScanAt
                            ? new Date(scannerHealth.lastScanAt).toLocaleString()
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-foreground/80">Duration</dt>{" "}
                        <dd className="inline">
                          {scannerHealth?.lastScanDurationMs != null
                            ? `${scannerHealth.lastScanDurationMs} ms`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-foreground/80">Coins / signals</dt>{" "}
                        <dd className="inline">
                          {scannerHealth?.totalCoinsPlanned ?? 0} planned · {scannerHealth?.signalsEmitted ?? 0} signals
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-foreground/80">Gold 1m lag</dt>{" "}
                        <dd className="inline">
                          {scannerHealth?.gold1mLagMs != null
                            ? `${Math.round(scannerHealth.gold1mLagMs / 1000)}s behind latest bar`
                            : "—"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline text-foreground/80">Alts thin/empty 1m</dt>{" "}
                        <dd className="inline">{scannerHealth?.alt1mThinOrEmpty ?? 0}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline text-foreground/80">Timeframes</dt>{" "}
                        <dd className="inline">{(scannerHealth?.lastTimeframes ?? []).join(", ") || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  {scannerHealth && scannerHealth.errors.length > 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 max-h-48 overflow-y-auto">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">Recent errors</p>
                      <ul className="space-y-1 text-[11px] font-mono break-all">
                        {scannerHealth.errors.map((e, i) => (
                          <li key={`${e.coin}-${i}`}>
                            <span className="text-foreground">{e.coin}</span>{" "}
                            <span className="text-muted-foreground">[{e.phase}]</span> {e.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CrmJournalInsightsDialog
        open={journalInsightsWallet != null}
        targetWallet={journalInsightsWallet}
        onOpenChange={(next) => {
          if (!next) setJournalInsightsWallet(null);
        }}
        api={api}
        adminAddress={address}
      />
    </div>
  );
}
