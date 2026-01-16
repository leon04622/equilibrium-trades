import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { 
  Play, 
  Plus,
  Trash2,
  TrendingUp, 
  Settings, 
  GraduationCap,
  Upload,
  Youtube,
  Video
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { useWallet } from "@/lib/wallet-context";
import type { TutorialVideo } from "@shared/schema";

interface VideoPlayerProps {
  video: TutorialVideo | null;
  open: boolean;
  onClose: () => void;
}

function VideoPlayer({ video, open, onClose }: VideoPlayerProps) {
  const [videoError, setVideoError] = useState<string | null>(null);
  
  // Reset error when video changes or dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setVideoError(null);
    }
  };
  
  if (!video) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="pr-8">{video.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {video.description}
          </DialogDescription>
        </DialogHeader>
        <div className="aspect-video w-full bg-black">
          {video.youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : video.videoPath ? (
            videoError ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-white p-4">
                <p className="text-red-400 mb-2">Failed to load video</p>
                <p className="text-sm text-gray-400 text-center">{videoError}</p>
              </div>
            ) : (
              <video
                src={video.videoPath}
                controls
                autoPlay
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                onError={(e) => {
                  const target = e.target as HTMLVideoElement;
                  const errorCode = target.error?.code;
                  const errorMessage = target.error?.message || "Unknown error";
                  setVideoError(`Error ${errorCode}: ${errorMessage}`);
                }}
                className="w-full h-full"
              >
                Your browser does not support the video tag.
              </video>
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white">
              Video not available
            </div>
          )}
        </div>
        <div className="p-4 pt-2 flex items-center justify-between">
          <Badge variant="outline" className={
            video.category === "strategy" ? "bg-primary/15 text-primary" :
            video.category === "platform" ? "bg-blue-500/15 text-blue-400" :
            "bg-green-500/15 text-green-400"
          }>
            {video.category.charAt(0).toUpperCase() + video.category.slice(1)}
          </Badge>
          <span className="text-sm text-muted-foreground">{video.duration}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VideoCard({ video, onDelete, onPlay, isAdmin }: { video: TutorialVideo; onDelete: (id: string) => void; onPlay: (video: TutorialVideo) => void; isAdmin: boolean }) {
  const categoryColors: Record<string, string> = {
    strategy: "bg-primary/15 text-primary border-primary/30",
    platform: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    tips: "bg-green-500/15 text-green-400 border-green-500/30",
  };

  const categoryLabels: Record<string, string> = {
    strategy: "Strategy",
    platform: "Platform",
    tips: "Tips",
  };

  const getThumbnail = () => {
    if (video.youtubeId) {
      return `https://img.youtube.com/vi/${video.youtubeId}/maxresdefault.jpg`;
    }
    if (video.thumbnailPath) {
      return video.thumbnailPath;
    }
    return null;
  };

  const thumbnail = getThumbnail();

  return (
    <Card className="hover-elevate group" data-testid={`video-card-${video.id}`}>
      <div 
        className="relative aspect-video bg-muted rounded-t-lg overflow-hidden cursor-pointer"
        onClick={() => onPlay(video)}
      >
        {thumbnail ? (
          <img 
            src={thumbnail}
            alt={video.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              if (video.youtubeId) {
                (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`;
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <Video className="h-12 w-12 text-primary/50" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center">
            <Play className="h-8 w-8 text-primary-foreground ml-1" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
          {video.duration}
        </div>
        <div className="absolute top-2 left-2">
          {video.youtubeId ? (
            <Badge variant="outline" className="bg-red-500/80 text-white border-red-500">
              <Youtube className="h-3 w-3 mr-1" />
              YouTube
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-primary/80 text-white border-primary">
              <Upload className="h-3 w-3 mr-1" />
              Uploaded
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold line-clamp-2">{video.title}</h3>
          <Badge variant="outline" className={categoryColors[video.category]}>
            {categoryLabels[video.category]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{video.description}</p>
        {isAdmin && (
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={(e) => { e.stopPropagation(); onDelete(video.id); }}
              data-testid={`button-delete-video-${video.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddVideoForm({ onSuccess }: { onSuccess: () => void }) {
  const [uploadType, setUploadType] = useState<"youtube" | "upload">("youtube");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [category, setCategory] = useState<"strategy" | "platform" | "tips">("strategy");
  const [youtubeId, setYoutubeId] = useState("");
  const [uploadedVideoPath, setUploadedVideoPath] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { address } = useWallet();

  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      setUploadedVideoPath(response.objectPath);
      toast({ title: "Video uploaded successfully" });
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; duration: string; category: string; youtubeId?: string; videoPath?: string }) => {
      if (!address) throw new Error("Wallet not connected");
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": address,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Video added successfully" });
      resetForm();
      onSuccess();
    },
    onError: () => {
      toast({ title: "Failed to add video", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDuration("");
    setYoutubeId("");
    setUploadedVideoPath("");
  };

  const extractYoutubeId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    return match ? match[1] : url;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (uploadType === "youtube") {
      const extractedId = extractYoutubeId(youtubeId);
      createMutation.mutate({ title, description, duration, category, youtubeId: extractedId });
    } else {
      if (!uploadedVideoPath) {
        toast({ title: "Please upload a video first", variant: "destructive" });
        return;
      }
      createMutation.mutate({ title, description, duration, category, videoPath: uploadedVideoPath });
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      uploadFile(file);
    } else {
      toast({ title: "Please drop a video file", variant: "destructive" });
    }
  }, [uploadFile, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2 mb-4">
        <Button
          type="button"
          variant={uploadType === "youtube" ? "default" : "outline"}
          onClick={() => setUploadType("youtube")}
          className="flex-1"
          data-testid="button-youtube-type"
        >
          <Youtube className="h-4 w-4 mr-2" />
          YouTube Link
        </Button>
        <Button
          type="button"
          variant={uploadType === "upload" ? "default" : "outline"}
          onClick={() => setUploadType("upload")}
          className="flex-1"
          data-testid="button-upload-type"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Video
        </Button>
      </div>

      {uploadType === "upload" && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          } ${uploadedVideoPath ? "bg-green-500/10 border-green-500" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          data-testid="dropzone-video"
        >
          {isUploading ? (
            <div className="space-y-2">
              <Video className="h-10 w-10 mx-auto text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : uploadedVideoPath ? (
            <div className="space-y-2">
              <Video className="h-10 w-10 mx-auto text-green-500" />
              <p className="text-sm text-green-600 font-medium">Video uploaded!</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUploadedVideoPath("")}
              >
                Remove & Upload Different
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop a video file here, or click to browse
              </p>
              <input
                type="file"
                accept="video/*"
                className="hidden"
                id="video-upload"
                onChange={handleFileSelect}
                data-testid="input-video-file"
              />
              <label htmlFor="video-upload">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span>Browse Files</span>
                </Button>
              </label>
            </div>
          )}
        </div>
      )}

      {uploadType === "youtube" && (
        <div className="space-y-2">
          <Label htmlFor="youtubeId">YouTube URL or Video ID</Label>
          <Input 
            id="youtubeId"
            value={youtubeId} 
            onChange={(e) => setYoutubeId(e.target.value)} 
            placeholder="e.g. https://youtube.com/watch?v=abc123 or just abc123"
            required={uploadType === "youtube"}
            data-testid="input-video-youtube"
          />
          <p className="text-xs text-muted-foreground">
            Paste the full YouTube URL or just the video ID
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input 
          id="title"
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          placeholder="e.g. Introduction to Bull Flags"
          required
          data-testid="input-video-title"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea 
          id="description"
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          placeholder="Brief description of the video content..."
          required
          data-testid="input-video-description"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (optional)</Label>
          <Input 
            id="duration"
            value={duration} 
            onChange={(e) => setDuration(e.target.value)} 
            placeholder="e.g. 5:30"
            data-testid="input-video-duration"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as "strategy" | "platform" | "tips")}>
            <SelectTrigger data-testid="select-video-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strategy">Strategy</SelectItem>
              <SelectItem value="platform">Platform</SelectItem>
              <SelectItem value="tips">Tips</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button 
        type="submit" 
        className="w-full" 
        disabled={createMutation.isPending || isUploading} 
        data-testid="button-add-video"
      >
        {createMutation.isPending ? "Adding..." : "Add Video"}
      </Button>
    </form>
  );
}

export default function Videos() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<TutorialVideo | null>(null);
  const { toast } = useToast();
  const { address } = useWallet();

  const { data: isAdminData } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check", address],
    queryFn: async () => {
      if (!address) return { isAdmin: false };
      const res = await fetch(`/api/admin/check/${address}`);
      return res.json();
    },
    enabled: !!address,
  });

  const isAdmin = isAdminData?.isAdmin ?? false;

  const { data: videos = [], isLoading } = useQuery<TutorialVideo[]>({
    queryKey: ["/api/videos"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!address) throw new Error("Wallet not connected");
      const res = await fetch(`/api/videos/${id}`, {
        method: "DELETE",
        headers: { "x-wallet-address": address },
      });
      if (!res.ok) throw new Error("Failed to delete video");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      toast({ title: "Video deleted" });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this video?")) {
      deleteMutation.mutate(id);
    }
  };

  const strategyVideos = videos.filter(v => v.category === "strategy");
  const platformVideos = videos.filter(v => v.category === "platform");
  const tipsVideos = videos.filter(v => v.category === "tips");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Video Tutorials</h1>
          <p className="text-muted-foreground">Learn trading strategies and how to use Equilibrium</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-open-add-video">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Video
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add New Video</DialogTitle>
                </DialogHeader>
                <AddVideoForm onSuccess={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{strategyVideos.length}</p>
              <p className="text-sm text-muted-foreground">Strategy Videos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Settings className="h-6 w-6 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{platformVideos.length}</p>
              <p className="text-sm text-muted-foreground">Platform Guides</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-green-500/15 flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{tipsVideos.length}</p>
              <p className="text-sm text-muted-foreground">Trading Tips</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading videos...</div>
      ) : videos.length === 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="p-12 text-center">
            <Play className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-semibold text-lg mb-2">No Videos Yet</h3>
            <p className="text-muted-foreground mb-4">
              {isAdmin 
                ? "Add your first tutorial video - upload from your computer or link a YouTube video."
                : "Tutorial videos will be available soon. Check back later!"}
            </p>
            {isAdmin && (
              <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-video">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Video
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList data-testid="tabs-videos">
            <TabsTrigger value="all" data-testid="tab-all-videos">
              All ({videos.length})
            </TabsTrigger>
            <TabsTrigger value="strategy" data-testid="tab-strategy">
              Strategy ({strategyVideos.length})
            </TabsTrigger>
            <TabsTrigger value="platform" data-testid="tab-platform">
              Platform ({platformVideos.length})
            </TabsTrigger>
            <TabsTrigger value="tips" data-testid="tab-tips">
              Tips ({tipsVideos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} onDelete={handleDelete} onPlay={setPlayingVideo} isAdmin={isAdmin} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="strategy">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategyVideos.map((video) => (
                <VideoCard key={video.id} video={video} onDelete={handleDelete} onPlay={setPlayingVideo} isAdmin={isAdmin} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="platform">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {platformVideos.map((video) => (
                <VideoCard key={video.id} video={video} onDelete={handleDelete} onPlay={setPlayingVideo} isAdmin={isAdmin} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tips">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tipsVideos.map((video) => (
                <VideoCard key={video.id} video={video} onDelete={handleDelete} onPlay={setPlayingVideo} isAdmin={isAdmin} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <VideoPlayer 
        video={playingVideo} 
        open={playingVideo !== null} 
        onClose={() => setPlayingVideo(null)} 
      />
    </div>
  );
}
