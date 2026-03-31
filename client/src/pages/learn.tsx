import { useState, useEffect, useCallback } from "react";
import { 
  GraduationCap, PlayCircle, CheckCircle2, Lock, Clock,
  TrendingUp, BookOpen, Target, ChevronRight, RotateCcw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";

interface Module {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
  completed: number;
}

interface Lesson {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  locked: boolean;
  patternId?: string;
}

const initialLessons: Omit<Lesson, 'completed' | 'locked'>[] = [
  { id: "1", title: "Introduction to Technical Analysis", duration: "5 min" },
  { id: "2", title: "Understanding Candlesticks", duration: "8 min" },
  { id: "3", title: "Support and Resistance", duration: "10 min" },
  { id: "4", title: "Trend Lines and Channels", duration: "12 min" },
  { id: "5", title: "Understanding Moving Averages", duration: "7 min" },
  { id: "6", title: "The 21 SMA - Fast Signal", duration: "6 min" },
  { id: "7", title: "The 200 SMA - Trend Filter", duration: "8 min" },
  { id: "8", title: "5-Minute Confirmation", duration: "10 min" },
  { id: "9", title: "Putting It All Together", duration: "15 min" },
  { id: "10", title: "Bull Flags", duration: "10 min", patternId: "bull-flag" },
  { id: "11", title: "Bear Flags", duration: "10 min", patternId: "bear-flag" },
  { id: "12", title: "Ascending Triangles", duration: "12 min", patternId: "ascending-triangle" },
  { id: "13", title: "Descending Triangles", duration: "12 min", patternId: "descending-triangle" },
  { id: "14", title: "Pennants", duration: "8 min", patternId: "pennant" },
  { id: "15", title: "Double Tops & Bottoms", duration: "12 min", patternId: "double-top" },
  { id: "16", title: "Head and Shoulders", duration: "15 min", patternId: "head-and-shoulders" },
  { id: "17", title: "Wedges", duration: "10 min", patternId: "wedge-rising" },
  { id: "18", title: "Diamond Patterns", duration: "12 min", patternId: "diamond" },
];

const moduleDefinitions = [
  { id: "basics", title: "Trading Basics", description: "Learn the fundamental concepts of technical analysis", lessonIds: ["1", "2", "3", "4"] },
  { id: "sma-strategy", title: "The Equilibrium SMA Strategy", description: "Master the 21/200 SMA crossover system", lessonIds: ["5", "6", "7", "8", "9"] },
  { id: "continuation", title: "Continuation Patterns", description: "Learn patterns that signal trend continuation", lessonIds: ["10", "11", "12", "13", "14"] },
  { id: "reversal", title: "Reversal Patterns", description: "Identify when trends are about to change", lessonIds: ["15", "16", "17", "18"] },
];

const STORAGE_KEY = "equilibrium_learning_progress";

const getStorageKey = (walletAddress?: string) => {
  return walletAddress ? `${STORAGE_KEY}_${walletAddress.toLowerCase()}` : STORAGE_KEY;
};

const loadProgress = (walletAddress?: string): Set<string> => {
  try {
    const key = getStorageKey(walletAddress);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      return new Set(parsed);
    }
  } catch (e) {
    console.error("Failed to load learning progress:", e);
  }
  return new Set();
};

const saveProgress = (completedLessons: Set<string>, walletAddress?: string | null) => {
  try {
    const key = getStorageKey(walletAddress || undefined);
    localStorage.setItem(key, JSON.stringify(Array.from(completedLessons)));
  } catch (e) {
    console.error("Failed to save learning progress:", e);
  }
};

export default function Learn() {
  const { address } = useWallet();
  const { toast } = useToast();
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(() => loadProgress(address || undefined));
  const [isInitialized, setIsInitialized] = useState(false);

  // Load progress when wallet address changes
  useEffect(() => {
    const loaded = loadProgress(address || undefined);
    setCompletedLessonIds(loaded);
    setIsInitialized(true);
  }, [address]);

  // Auto-save progress whenever it changes (after initial load)
  useEffect(() => {
    if (isInitialized && completedLessonIds.size >= 0) {
      saveProgress(completedLessonIds, address);
    }
  }, [completedLessonIds, address, isInitialized]);

  // Save progress before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveProgress(completedLessonIds, address);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [completedLessonIds, address]);

  const buildModules = useCallback((): Module[] => {
    return moduleDefinitions.map((def, moduleIndex) => {
      const lessons: Lesson[] = def.lessonIds.map((lessonId, lessonIndex) => {
        const lessonDef = initialLessons.find(l => l.id === lessonId)!;
        const completed = completedLessonIds.has(lessonId);
        
        let locked = false;
        if (moduleIndex >= 2 && lessonIndex >= 2) {
          const prevLessonId = def.lessonIds[lessonIndex - 1];
          locked = !completedLessonIds.has(prevLessonId);
        } else if (moduleIndex === 1 && lessonIndex >= 3) {
          const prevLessonId = def.lessonIds[lessonIndex - 1];
          locked = !completedLessonIds.has(prevLessonId);
        }
        
        return {
          ...lessonDef,
          completed,
          locked,
        };
      });
      
      const completedCount = lessons.filter(l => l.completed).length;
      
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        lessons,
        completed: completedCount,
      };
    });
  }, [completedLessonIds]);

  const modules = buildModules();
  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const completedLessonsCount = modules.reduce((acc, m) => acc + m.completed, 0);
  const progress = (completedLessonsCount / totalLessons) * 100;

  const markLessonComplete = (lessonId: string) => {
    const newCompleted = new Set(completedLessonIds);
    newCompleted.add(lessonId);
    setCompletedLessonIds(newCompleted);
    saveProgress(newCompleted, address);
    toast({
      title: "Lesson Completed!",
      description: "Your progress has been saved.",
    });
  };

  const resetProgress = () => {
    const emptySet = new Set<string>();
    setCompletedLessonIds(emptySet);
    saveProgress(emptySet, address);
    toast({
      title: "Progress Reset",
      description: "Your learning progress has been reset.",
    });
  };

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.locked) return;
    if (lesson.patternId) {
      const pattern = tradingPatterns.find(p => p.id === lesson.patternId);
      if (pattern) {
        setSelectedPattern(pattern);
        setModalOpen(true);
      }
    }
    if (!lesson.completed) {
      markLessonComplete(lesson.id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-lg shadow-primary/5">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-display font-bold">Learn Trading</h1>
              </div>
              <p className="max-w-2xl text-muted-foreground">
                Build skill with a structured path through technical analysis, the 21/200 SMA methodology, and the
                exact pattern language used across the platform.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/80 px-4 py-3 text-sm">
              <p className="font-medium">Progress is saved per wallet</p>
              <p className="mt-1 text-muted-foreground">
                Your learning path stays tied to the wallet you use on the platform.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h2 className="text-2xl font-display font-bold">Curriculum Overview</h2>
        </div>
        <p className="text-muted-foreground">Master trading patterns with a cleaner, structured curriculum.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Your Learning Progress</h2>
                {completedLessonsCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetProgress}
                    className="text-muted-foreground"
                    data-testid="button-reset-progress"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground mb-4">
                You've completed {completedLessonsCount} of {totalLessons} lessons
              </p>
              <Progress value={progress} className="h-3" />
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold font-display">{completedLessonsCount}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold font-display">{totalLessons - completedLessonsCount}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {modules.map((module, moduleIndex) => {
          const moduleProgress = (module.completed / module.lessons.length) * 100;
          
          return (
            <Card key={module.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold",
                      module.completed === module.lessons.length 
                        ? "bg-success/15 text-success"
                        : module.completed > 0 
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {moduleIndex + 1}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{module.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {module.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">
                      {module.completed}/{module.lessons.length}
                    </p>
                    <p className="text-xs text-muted-foreground">lessons</p>
                  </div>
                </div>
                <Progress value={moduleProgress} className="h-1.5 mt-4" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {module.lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonClick(lesson)}
                      disabled={lesson.locked}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        lesson.locked 
                          ? "opacity-50 cursor-not-allowed"
                          : "hover-elevate cursor-pointer"
                      )}
                      data-testid={`lesson-${lesson.id}`}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                        lesson.completed 
                          ? "bg-success/15 text-success"
                          : lesson.locked
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/15 text-primary"
                      )}>
                        {lesson.completed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : lesson.locked ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium",
                          lesson.completed && "text-muted-foreground line-through"
                        )}>
                          {lesson.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{lesson.duration}</span>
                          {lesson.patternId && (
                            <Badge variant="secondary" className="text-[10px]">
                              Interactive
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!lesson.locked && !lesson.completed && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PatternModal
        pattern={selectedPattern}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
