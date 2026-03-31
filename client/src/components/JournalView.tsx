import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Loader2, NotebookPen } from "lucide-react";
import type { TradeJournalEntry, TradeJournalStats } from "@shared/schema";
import { useWallet } from "@/lib/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NEGATIVE_RR_TOOLTIP =
  "Institutional Tip: Always aim for at least 2:1 Reward-to-Risk to stay profitable long-term.";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText);
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<T>;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtPrice(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

type JournalViewProps = {
  variant?: "page" | "embedded";
};

export function JournalView({ variant = "page" }: JournalViewProps) {
  const { address: walletAddress, isConnected } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (walletAddress) h["x-wallet-address"] = walletAddress;
    return h;
  }, [walletAddress]);

  const journalConfigQuery = useQuery({
    queryKey: ["trade-journal-config"],
    queryFn: async () => {
      try {
        return await fetchJson<{ persistedToVault: boolean }>("/api/trade-journal/config");
      } catch {
        return { persistedToVault: false as boolean };
      }
    },
    enabled: !!walletAddress,
    staleTime: 60_000,
  });

  /** When false, journal rows live only in this server process (no Postgres / Mongo persistence). */
  const journalPersisted = journalConfigQuery.data?.persistedToVault !== false;

  const statsQuery = useQuery({
    queryKey: ["trade-journal-stats", walletAddress],
    queryFn: async () => {
      try {
        return await fetchJson<TradeJournalStats>(
          `/api/trade-journal/stats/${encodeURIComponent(walletAddress!)}`,
          { headers },
        );
      } catch (e) {
        console.warn("[JournalView] stats", e);
        throw e;
      }
    },
    enabled: !!walletAddress,
    staleTime: 15_000,
  });

  const entriesQuery = useQuery({
    queryKey: ["trade-journal-entries", walletAddress],
    queryFn: async () => {
      try {
        return await fetchJson<TradeJournalEntry[]>(
          `/api/trade-journal/entries/${encodeURIComponent(walletAddress!)}?limit=50000`,
          { headers },
        );
      } catch (e) {
        console.warn("[JournalView] entries", e);
        throw e;
      }
    },
    enabled: !!walletAddress,
    staleTime: 15_000,
  });

  const patchNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      if (!walletAddress) throw new Error("Wallet required");
      return fetchJson<TradeJournalEntry>(`/api/trade-journal/entries/${encodeURIComponent(id)}/notes`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    },
    onSuccess: (_data, vars) => {
      setDraftNotes((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["trade-journal-entries", walletAddress] });
      void queryClient.invalidateQueries({ queryKey: ["trade-journal-stats", walletAddress] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not save notes", description: e.message, variant: "destructive" });
    },
  });

  const flushNotes = useCallback(
    (id: string, serverNotes: string) => {
      const current = draftNotes[id] !== undefined ? draftNotes[id]! : serverNotes;
      if (current === serverNotes) return;
      patchNotes.mutate({ id, notes: current });
    },
    [draftNotes, patchNotes],
  );

  if (!isConnected || !walletAddress) {
    return (
      <Card className={cn(variant === "embedded" && "border-border/60")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <NotebookPen className="h-5 w-5" />
            Trade Journal
          </CardTitle>
          <CardDescription>Connect your wallet to log and review executions.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const stats = statsQuery.data;
  const entries = entriesQuery.data ?? [];
  const winRate =
    stats?.winRatePercent != null && Number.isFinite(stats.winRatePercent)
      ? `${stats.winRatePercent.toFixed(1)}%`
      : "—";
  const avgRR =
    stats?.avgRewardRisk != null && Number.isFinite(stats.avgRewardRisk)
      ? `${stats.avgRewardRisk.toFixed(2)} : 1`
      : "—";
  const totalPl =
    stats?.totalProfitLoss != null && Number.isFinite(stats.totalProfitLoss)
      ? `${stats.totalProfitLoss >= 0 ? "+" : ""}$${stats.totalProfitLoss.toFixed(2)}`
      : "—";

  return (
    <div className={cn("space-y-6", variant === "page" && "p-4 md:p-8 max-w-6xl mx-auto pb-24 md:pb-10")}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <BookMarked className="h-6 w-6" />
              <span className="text-xs font-semibold uppercase tracking-wider">Professional</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">Trade Journal</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Executions are logged automatically when you place trades. Close positions from the platform to
              update win rate and P/L. Notes are saved per row.
            </p>
          </div>
          {variant === "embedded" && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/journal">Full journal</Link>
            </Button>
          )}
        </div>

        {!journalPersisted && stats && (
          <Alert className="border-amber-500/50 bg-amber-950/25 text-amber-100 [&>svg]:text-amber-300">
            <AlertTitle className="text-amber-200">Journal not persisted to disk</AlertTitle>
            <AlertDescription className="text-amber-100/90 text-sm">
              The server is running without persistent journal storage. Trades are kept only in this server process,
              so restarts or scaling can clear them. Configure PostgreSQL or MongoDB for full history across sessions.
            </AlertDescription>
          </Alert>
        )}

        {(statsQuery.isError || entriesQuery.isError) && (
          <Alert variant="destructive">
            <AlertTitle>Journal data unavailable</AlertTitle>
            <AlertDescription className="text-sm">
              {statsQuery.isError && statsQuery.error instanceof Error
                ? statsQuery.error.message
                : entriesQuery.isError && entriesQuery.error instanceof Error
                  ? entriesQuery.error.message
                  : "Try again in a moment."}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold font-mono tabular-nums">{winRate}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {stats?.closedTradesCount ? `${stats.closedTradesCount} closed trades` : "No closed trades yet"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average R:R</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold font-mono tabular-nums">{avgRR}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Planned reward ÷ risk at entry</p>
            </CardContent>
          </Card>
          <Card className="border-border/80 bg-card/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P/L</CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-2xl font-bold font-mono tabular-nums",
                  stats?.totalProfitLoss != null && stats.totalProfitLoss >= 0 && "text-emerald-500",
                  stats?.totalProfitLoss != null && stats.totalProfitLoss < 0 && "text-destructive",
                )}
              >
                {totalPl}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {stats?.openTradesCount ? `${stats.openTradesCount} open in journal` : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/80 bg-card/40">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Trade log</CardTitle>
              <CardDescription>Pair, side, entry, coach flags, and your notes.</CardDescription>
            </div>
            {entriesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            {entriesQuery.isLoading ? (
              <div className="flex justify-center py-12 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading journal…
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                No journal rows yet. Execute a trade on the Trading tab to create your first entry.
              </p>
            ) : (
              <ScrollArea className={cn(variant === "embedded" ? "h-[min(380px,45vh)]" : "h-[min(560px,60vh)]")}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Time</TableHead>
                      <TableHead>Pair</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">SL / TP</TableHead>
                      <TableHead className="text-right">R:R</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Coach</TableHead>
                      <TableHead className="min-w-[200px]">Notes</TableHead>
                      <TableHead className="text-right">P/L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((row) => {
                      const draft =
                        draftNotes[row.id] !== undefined ? draftNotes[row.id]! : (row.notes ?? "");
                      const rr =
                        row.rewardRiskRatio != null && Number.isFinite(row.rewardRiskRatio)
                          ? `${row.rewardRiskRatio.toFixed(2)} : 1`
                          : "—";
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                            {fmtTime(row.openedAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs align-top">{row.pair}</TableCell>
                          <TableCell className="align-top">
                            <Badge variant={row.side === "long" ? "default" : "destructive"} className="text-[10px]">
                              {row.side === "long" ? "Long" : "Short"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs align-top">
                            {fmtPrice(row.entryPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs align-top">{row.size}</TableCell>
                          <TableCell className="text-right font-mono text-[11px] align-top text-muted-foreground">
                            {fmtPrice(row.stopLoss)} / {fmtPrice(row.takeProfit)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs align-top">{rr}</TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant={row.entryGrade === "A" ? "default" : "secondary"}
                              className={cn(
                                "text-[10px]",
                                row.entryGrade === "A" && "bg-emerald-600/90 hover:bg-emerald-600",
                              )}
                            >
                              {row.entryGrade === "A" ? "A" : "Speculative"}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {row.negativeRR ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="destructive" className="text-[10px] cursor-help">
                                    Negative R:R
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-sm">{NEGATIVE_RR_TOOLTIP}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top min-w-[200px]">
                            <Textarea
                              className="min-h-[56px] text-xs resize-y"
                              value={draft}
                              placeholder="Why you took the trade (e.g. 1m Bull Flag break)"
                              onChange={(e) => setDraftNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              onBlur={() => flushNotes(row.id, row.notes ?? "")}
                              disabled={patchNotes.isPending}
                            />
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-mono text-xs align-top",
                              row.realizedPnl != null && row.realizedPnl >= 0 && "text-emerald-500",
                              row.realizedPnl != null && row.realizedPnl < 0 && "text-destructive",
                            )}
                          >
                            {row.realizedPnl != null && Number.isFinite(row.realizedPnl)
                              ? `${row.realizedPnl >= 0 ? "+" : ""}$${row.realizedPnl.toFixed(2)}`
                              : row.status === "open"
                                ? "Open"
                                : "—"}
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
      </div>
  );
}
