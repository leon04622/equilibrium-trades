import type { AxiosInstance } from "axios";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { TradeJournalEntry, TradeJournalStats } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type Props = {
  /** Wallet whose journal to inspect (CRM row); null = closed */
  targetWallet: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: AxiosInstance;
  /** Master admin connected wallet — required for authenticated API calls */
  adminAddress: string | null | undefined;
};

/**
 * Command Center: open from Live CRM when clicking a user wallet. Keeps all journal query state here
 * so the parent page cannot reference an undefined variable.
 */
export function CrmJournalInsightsDialog({
  targetWallet,
  open,
  onOpenChange,
  api,
  adminAddress,
}: Props) {
  const w = targetWallet?.trim() || null;

  const { data: crmJournalStats, isLoading: crmJournalStatsLoading } = useQuery({
    queryKey: ["crm-user-journal-stats", adminAddress, w],
    enabled: !!adminAddress && !!w && open,
    queryFn: async () => {
      const { data, status } = await api.get<TradeJournalStats>(
        `/api/trade-journal/stats/${encodeURIComponent(w!)}`,
      );
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load journal stats");
      return data;
    },
  });

  const { data: crmJournalEntries = [], isLoading: crmJournalEntriesLoading } = useQuery({
    queryKey: ["crm-user-journal-entries", adminAddress, w],
    enabled: !!adminAddress && !!w && open,
    queryFn: async () => {
      const { data, status } = await api.get<TradeJournalEntry[]>(
        `/api/trade-journal/entries/${encodeURIComponent(w!)}?limit=30`,
      );
      if (status === 401 || status === 403) throw new Error("Unauthorized");
      if (status !== 200) throw new Error("Failed to load journal entries");
      return Array.isArray(data) ? data : [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trade journal</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">{w}</DialogDescription>
        </DialogHeader>
        {crmJournalStatsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading stats…
          </div>
        ) : crmJournalStats ? (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md border border-border/60 p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Win rate</p>
              <p className="font-mono font-semibold">
                {crmJournalStats.winRatePercent != null
                  ? `${crmJournalStats.winRatePercent.toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Avg R:R</p>
              <p className="font-mono font-semibold">
                {crmJournalStats.avgRewardRisk != null
                  ? `${crmJournalStats.avgRewardRisk.toFixed(2)} : 1`
                  : "—"}
              </p>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <p className="text-[10px] text-muted-foreground uppercase">Total P/L</p>
              <p className="font-mono font-semibold">
                {crmJournalStats.totalProfitLoss != null
                  ? `${crmJournalStats.totalProfitLoss >= 0 ? "+" : ""}$${crmJournalStats.totalProfitLoss.toFixed(2)}`
                  : "—"}
              </p>
            </div>
            <p className="col-span-3 text-xs text-muted-foreground">
              Closed: {crmJournalStats.closedTradesCount} · Open (journal): {crmJournalStats.openTradesCount}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No stats available.</p>
        )}

        <div className="border-t pt-3 mt-2">
          <p className="text-sm font-medium mb-2">Recent journal rows</p>
          {crmJournalEntriesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : crmJournalEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No journal entries for this wallet.</p>
          ) : (
            <ul className="space-y-2 max-h-[220px] overflow-y-auto text-xs">
              {crmJournalEntries.slice(0, 12).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap justify-between gap-1 rounded border border-border/50 px-2 py-1.5"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(e.openedAt).toLocaleString()}
                  </span>
                  <span className="font-medium">
                    {e.pair} · {e.side} · {e.entryGrade}
                    {e.negativeRR ? (
                      <Badge variant="destructive" className="ml-1 text-[9px]">
                        Neg R:R
                      </Badge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
