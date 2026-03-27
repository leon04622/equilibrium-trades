import { useMemo, useState, useCallback, type ChangeEvent } from "react";
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
} from "lucide-react";
import type { TutorialVideo } from "@shared/schema";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { parseVideosApiList } from "@/lib/video-vault";
import { FORTRESS_SOVEREIGN_WALLET } from "@/lib/fortress-admin";
import { cn } from "@/lib/utils";

type CrmRow = {
  wallet: string;
  email: string | null;
  joinDate: string | null;
  subTier: string;
};

type SortKey = "wallet" | "email" | "joinDate" | "subTier";

function useSovereignApi(address: string | null | undefined): AxiosInstance {
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
    va = String(a[key] ?? "").toLowerCase();
    vb = String(b[key] ?? "").toLowerCase();
    return va.localeCompare(vb) * mult;
  });
}

export default function AdminCommandCenter() {
  const { address } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const api = useSovereignApi(address);
  const { uploadFile, isUploading: isVideoFileUploading, error: videoUploadHookError } = useUpload();

  const [tab, setTab] = useState("videos");
  const [crmSort, setCrmSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "joinDate",
    dir: "desc",
  });

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

  const sortedCrm = useMemo(
    () => sortCrmRows(crmUsers, crmSort.key, crmSort.dir),
    [crmUsers, crmSort],
  );

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
        const body = data as { error?: string; details?: unknown };
        let msg = body?.error || "Save failed";
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
        title: "Video Added Successfully",
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Shield className="h-6 w-6" />
            <span className="text-xs font-semibold uppercase tracking-wider">Fortress</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">Admin Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Sovereign wallet only. Publish lessons to the Educational Vault (file upload) and browse CRM. Optional:{" "}
            <code className="text-[10px]">MONGO_VAULT_URI</code> / Mongo for vault data; otherwise PostgreSQL.{" "}
            <code className="text-[10px]">GET /health</code> → <code className="text-[10px]">mongoVault.connected</code>.
          </p>
          <p className="text-[10px] text-muted-foreground/80 font-mono mt-2 break-all">
            {FORTRESS_SOVEREIGN_WALLET}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/">← Home</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="videos" className="gap-1.5">
            <Video className="h-4 w-4 shrink-0" />
            Videos
          </TabsTrigger>
          <TabsTrigger value="crm" className="gap-1.5">
            <Users className="h-4 w-4 shrink-0" />
            User CRM
          </TabsTrigger>
        </TabsList>

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
                <Label>Category / vault section</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Beginner Patterns">Beginner Patterns</SelectItem>
                    <SelectItem value="SMA Masterclass">SMA Masterclass</SelectItem>
                    <SelectItem value="Live Trading Sessions">Live Trading Sessions</SelectItem>
                  </SelectContent>
                </Select>
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
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm space-y-2">
                  <p className="font-medium text-destructive">Could not load videos</p>
                  <p className="text-muted-foreground">
                    {videosErrorObj instanceof Error ? videosErrorObj.message : String(videosErrorObj)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void refetchVideos()}>
                    Retry
                  </Button>
                </div>
              ) : videosLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : videos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No videos yet.</p>
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

        <TabsContent value="crm">
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>User CRM</CardTitle>
                <CardDescription>GET /api/crm/users — wallet_users</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void refetchCrm()} aria-label="Refresh CRM">
                <RefreshCw className={cn("h-4 w-4", crmLoading && "animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent>
              {crmError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm space-y-2">
                  <p className="font-medium text-destructive">Could not load CRM</p>
                  <p className="text-muted-foreground">
                    {crmErrorObj instanceof Error ? crmErrorObj.message : String(crmErrorObj)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void refetchCrm()}>
                    Retry
                  </Button>
                </div>
              ) : crmLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : (
                <ScrollArea className="h-[min(520px,60vh)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[44%]">
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCrm.map((row) => (
                        <TableRow key={row.wallet}>
                          <TableCell className="font-mono text-xs align-top break-all">{row.wallet}</TableCell>
                          <TableCell className="text-sm align-top">{row.email || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                            {row.joinDate ? new Date(row.joinDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge variant="secondary" className="text-xs">
                              {row.subTier || "free"}
                            </Badge>
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
      </Tabs>
    </div>
  );
}
