import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play, 
  Clock, 
  BookOpen, 
  TrendingUp, 
  Settings, 
  GraduationCap,
  ExternalLink
} from "lucide-react";

interface Video {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: "strategy" | "platform" | "tips";
  youtubeId: string;
  thumbnail?: string;
}

const videos: Video[] = [
  {
    id: "1",
    title: "Introduction to Equilibrium",
    description: "Learn the basics of the platform and how to navigate the dashboard, trading view, and pattern library.",
    duration: "5:30",
    category: "platform",
    youtubeId: "",
  },
  {
    id: "2", 
    title: "The 21/200 SMA Crossover Strategy",
    description: "Master the core trading strategy - understanding when the 21 SMA crosses the 200 SMA and what it means for your trades.",
    duration: "12:45",
    category: "strategy",
    youtubeId: "",
  },
  {
    id: "3",
    title: "How to Connect Your Wallet",
    description: "Step-by-step guide to connecting your MetaMask wallet and setting up your trading agent for Hyperliquid.",
    duration: "4:20",
    category: "platform",
    youtubeId: "",
  },
  {
    id: "4",
    title: "Identifying Bull Flags",
    description: "Learn to spot bull flag patterns on the chart and understand the optimal entry and exit points.",
    duration: "8:15",
    category: "strategy",
    youtubeId: "",
  },
  {
    id: "5",
    title: "Setting Take Profit & Stop Loss",
    description: "How to properly set TP/SL levels to manage risk and lock in profits on your trades.",
    duration: "6:40",
    category: "tips",
    youtubeId: "",
  },
  {
    id: "6",
    title: "Reading the AI Pattern Detection",
    description: "Understanding AI signals, confidence scores, and how to use them in your trading decisions.",
    duration: "7:30",
    category: "platform",
    youtubeId: "",
  },
  {
    id: "7",
    title: "Risk Management Fundamentals",
    description: "Essential risk management techniques every trader must know - position sizing, leverage, and capital preservation.",
    duration: "10:20",
    category: "tips",
    youtubeId: "",
  },
  {
    id: "8",
    title: "5-Minute Chart Confirmation",
    description: "How to use the 5-minute chart to confirm your 1-minute entries for higher probability trades.",
    duration: "9:00",
    category: "strategy",
    youtubeId: "",
  },
];

function VideoCard({ video, onPlay }: { video: Video; onPlay: (video: Video) => void }) {
  const categoryColors = {
    strategy: "bg-primary/15 text-primary border-primary/30",
    platform: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    tips: "bg-green-500/15 text-green-400 border-green-500/30",
  };

  const categoryLabels = {
    strategy: "Strategy",
    platform: "Platform",
    tips: "Tips",
  };

  return (
    <Card className="hover-elevate cursor-pointer group" onClick={() => onPlay(video)} data-testid={`video-card-${video.id}`}>
      <div className="relative aspect-video bg-muted rounded-t-lg overflow-hidden">
        {video.youtubeId ? (
          <img 
            src={`https://img.youtube.com/vi/${video.youtubeId}/maxresdefault.jpg`}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <Play className="h-12 w-12 text-primary/50" />
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
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold line-clamp-2">{video.title}</h3>
          <Badge variant="outline" className={categoryColors[video.category]}>
            {categoryLabels[video.category]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{video.description}</p>
      </CardContent>
    </Card>
  );
}

export default function Videos() {
  const handlePlayVideo = (video: Video) => {
    if (video.youtubeId) {
      window.open(`https://www.youtube.com/watch?v=${video.youtubeId}`, '_blank');
    }
  };

  const strategyVideos = videos.filter(v => v.category === "strategy");
  const platformVideos = videos.filter(v => v.category === "platform");
  const tipsVideos = videos.filter(v => v.category === "tips");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Video Tutorials</h1>
          <p className="text-muted-foreground">Learn trading strategies and how to use Equilibrium</p>
        </div>
        <a href="https://youtube.com/@cryptolifer" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" data-testid="button-youtube-channel">
            <ExternalLink className="h-4 w-4 mr-2" />
            YouTube Channel
          </Button>
        </a>
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

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList data-testid="tabs-videos">
          <TabsTrigger value="all" data-testid="tab-all-videos">
            All Videos ({videos.length})
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
              <VideoCard key={video.id} video={video} onPlay={handlePlayVideo} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="strategy">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strategyVideos.map((video) => (
              <VideoCard key={video.id} video={video} onPlay={handlePlayVideo} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="platform">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {platformVideos.map((video) => (
              <VideoCard key={video.id} video={video} onPlay={handlePlayVideo} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tips">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tipsVideos.map((video) => (
              <VideoCard key={video.id} video={video} onPlay={handlePlayVideo} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Card className="bg-muted/30">
        <CardContent className="p-6 text-center">
          <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">More Videos Coming Soon</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            New tutorials are added regularly. Subscribe to the YouTube channel to get notified when new content is available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
