import { useState } from "react";
import { 
  GraduationCap, PlayCircle, CheckCircle2, Lock, Clock,
  TrendingUp, BookOpen, Target, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PatternModal } from "@/components/pattern-modal";
import { tradingPatterns } from "@/lib/patterns";
import type { PatternDefinition } from "@shared/schema";
import { cn } from "@/lib/utils";

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

const modules: Module[] = [
  {
    id: "basics",
    title: "Trading Basics",
    description: "Learn the fundamental concepts of technical analysis",
    completed: 2,
    lessons: [
      { id: "1", title: "Introduction to Technical Analysis", duration: "5 min", completed: true, locked: false },
      { id: "2", title: "Understanding Candlesticks", duration: "8 min", completed: true, locked: false },
      { id: "3", title: "Support and Resistance", duration: "10 min", completed: false, locked: false },
      { id: "4", title: "Trend Lines and Channels", duration: "12 min", completed: false, locked: false },
    ],
  },
  {
    id: "sma-strategy",
    title: "The Equilibrium SMA Strategy",
    description: "Master the 21/200 SMA crossover system",
    completed: 1,
    lessons: [
      { id: "5", title: "Understanding Moving Averages", duration: "7 min", completed: true, locked: false },
      { id: "6", title: "The 21 SMA - Fast Signal", duration: "6 min", completed: false, locked: false },
      { id: "7", title: "The 200 SMA - Trend Filter", duration: "8 min", completed: false, locked: false },
      { id: "8", title: "5-Minute Confirmation", duration: "10 min", completed: false, locked: true },
      { id: "9", title: "Putting It All Together", duration: "15 min", completed: false, locked: true },
    ],
  },
  {
    id: "continuation",
    title: "Continuation Patterns",
    description: "Learn patterns that signal trend continuation",
    completed: 0,
    lessons: [
      { id: "10", title: "Bull Flags", duration: "10 min", completed: false, locked: false, patternId: "bull-flag" },
      { id: "11", title: "Bear Flags", duration: "10 min", completed: false, locked: false, patternId: "bear-flag" },
      { id: "12", title: "Ascending Triangles", duration: "12 min", completed: false, locked: true, patternId: "ascending-triangle" },
      { id: "13", title: "Descending Triangles", duration: "12 min", completed: false, locked: true, patternId: "descending-triangle" },
      { id: "14", title: "Pennants", duration: "8 min", completed: false, locked: true, patternId: "pennant" },
    ],
  },
  {
    id: "reversal",
    title: "Reversal Patterns",
    description: "Identify when trends are about to change",
    completed: 0,
    lessons: [
      { id: "15", title: "Double Tops & Bottoms", duration: "12 min", completed: false, locked: true, patternId: "double-top" },
      { id: "16", title: "Head and Shoulders", duration: "15 min", completed: false, locked: true, patternId: "head-and-shoulders" },
      { id: "17", title: "Wedges", duration: "10 min", completed: false, locked: true, patternId: "wedge-rising" },
      { id: "18", title: "Diamond Patterns", duration: "12 min", completed: false, locked: true, patternId: "diamond" },
    ],
  },
];

export default function Learn() {
  const [selectedPattern, setSelectedPattern] = useState<PatternDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);
  const completedLessons = modules.reduce((acc, m) => acc + m.completed, 0);
  const progress = (completedLessons / totalLessons) * 100;

  const handleLessonClick = (lesson: Lesson) => {
    if (lesson.locked) return;
    if (lesson.patternId) {
      const pattern = tradingPatterns.find(p => p.id === lesson.patternId);
      if (pattern) {
        setSelectedPattern(pattern);
        setModalOpen(true);
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Learn Trading</h1>
        </div>
        <p className="text-muted-foreground">
          Master trading patterns with our structured curriculum
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Your Learning Progress</h2>
              <p className="text-muted-foreground mb-4">
                You've completed {completedLessons} of {totalLessons} lessons
              </p>
              <Progress value={progress} className="h-3" />
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold font-display">{completedLessons}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold font-display">{totalLessons - completedLessons}</p>
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
