import { randomUUID } from "crypto";
import type { Collection, Document } from "mongodb";
import { getVaultDb } from "./mongo-vault";
import type { TradeJournalEntry, TradeJournalStats } from "@shared/schema";
import { computePlannedRewardRisk, journalEntryGrade } from "./trade-journal-logic";

const COLL_NAME = process.env.MONGO_TRADE_JOURNAL_COLLECTION?.trim() || "trade_journal";

type Status = "open" | "closed";

export type TradeJournalDoc = {
  id: string;
  walletAddress: string;
  pair: string;
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  size: number;
  openedAt: Date;
  stopLoss: number | null;
  takeProfit: number | null;
  leverage: number;
  notes: string;
  patternStatusAtEntry: string | null;
  entryGrade: "A" | "Speculative";
  negativeRR: boolean;
  rewardRiskRatio: number | null;
  status: Status;
  exitPrice: number | null;
  realizedPnl: number | null;
  closedAt: Date | null;
};

const memoryById = new Map<string, TradeJournalDoc>();

function coll(): Collection<Document> | null {
  const db = getVaultDb();
  return db ? db.collection(COLL_NAME) : null;
}

/** True when the journal uses MongoDB (`trade_journal`); false means in-memory only for this server process. */
export function isTradeJournalBackedByMongo(): boolean {
  return coll() != null;
}

function docToApi(d: TradeJournalDoc): TradeJournalEntry {
  return {
    id: d.id,
    walletAddress: d.walletAddress,
    pair: d.pair,
    coin: d.coin,
    side: d.side,
    entryPrice: d.entryPrice,
    size: d.size,
    openedAt: d.openedAt.toISOString(),
    stopLoss: d.stopLoss,
    takeProfit: d.takeProfit,
    leverage: d.leverage,
    notes: d.notes,
    patternStatusAtEntry: (d.patternStatusAtEntry as TradeJournalEntry["patternStatusAtEntry"]) ?? null,
    entryGrade: d.entryGrade,
    negativeRR: d.negativeRR,
    rewardRiskRatio: d.rewardRiskRatio,
    status: d.status,
    exitPrice: d.exitPrice,
    realizedPnl: d.realizedPnl,
    closedAt: d.closedAt ? d.closedAt.toISOString() : null,
  };
}

function parseDoc(raw: Document): TradeJournalDoc {
  const openedAt =
    raw.openedAt instanceof Date ? raw.openedAt : new Date(String(raw.openedAt || Date.now()));
  const closedAt =
    raw.closedAt == null
      ? null
      : raw.closedAt instanceof Date
        ? raw.closedAt
        : new Date(String(raw.closedAt));
  return {
    id: String(raw.id || raw._id),
    walletAddress: String(raw.walletAddress || "").toLowerCase(),
    pair: String(raw.pair ?? ""),
    coin: String(raw.coin ?? ""),
    side: raw.side === "short" ? "short" : "long",
    entryPrice: Number(raw.entryPrice),
    size: Number(raw.size),
    openedAt,
    stopLoss: raw.stopLoss == null ? null : Number(raw.stopLoss),
    takeProfit: raw.takeProfit == null ? null : Number(raw.takeProfit),
    leverage: Number(raw.leverage ?? 1) || 1,
    notes: String(raw.notes ?? ""),
    patternStatusAtEntry: raw.patternStatusAtEntry != null ? String(raw.patternStatusAtEntry) : null,
    entryGrade: raw.entryGrade === "A" ? "A" : "Speculative",
    negativeRR: Boolean(raw.negativeRR),
    rewardRiskRatio: raw.rewardRiskRatio == null || raw.rewardRiskRatio === "" ? null : Number(raw.rewardRiskRatio),
    status: raw.status === "closed" ? "closed" : "open",
    exitPrice: raw.exitPrice == null ? null : Number(raw.exitPrice),
    realizedPnl: raw.realizedPnl == null ? null : Number(raw.realizedPnl),
    closedAt,
  };
}

export async function insertTradeJournalEntry(input: {
  walletAddress: string;
  pair: string;
  coin: string;
  side: "long" | "short";
  entryPrice: number;
  size: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  leverage?: number;
  patternStatusAtEntry?: string | null;
  openedAt?: Date;
}): Promise<TradeJournalEntry> {
  const wallet = input.walletAddress.toLowerCase();
  const { negativeRR, rewardRiskRatio } = computePlannedRewardRisk(
    input.side,
    input.entryPrice,
    input.stopLoss,
    input.takeProfit,
  );
  const pattern = input.patternStatusAtEntry ?? null;
  const entryGrade = journalEntryGrade(pattern);

  const id = randomUUID();
  const openedAt = input.openedAt ?? new Date();
  const doc: TradeJournalDoc = {
    id,
    walletAddress: wallet,
    pair: input.pair,
    coin: input.coin,
    side: input.side,
    entryPrice: input.entryPrice,
    size: input.size,
    openedAt,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    leverage: input.leverage ?? 1,
    notes: "",
    patternStatusAtEntry: pattern,
    entryGrade,
    negativeRR,
    rewardRiskRatio,
    status: "open",
    exitPrice: null,
    realizedPnl: null,
    closedAt: null,
  };

  const c = coll();
  if (c) {
    await c.insertOne({ ...doc } as Document);
  } else {
    memoryById.set(id, doc);
  }
  return docToApi(doc);
}

export async function listTradeJournalEntries(walletAddress: string, limit = 10_000): Promise<TradeJournalEntry[]> {
  const w = walletAddress.toLowerCase();
  const c = coll();
  if (c) {
    const rows = await c
      .find({ walletAddress: w })
      .sort({ openedAt: -1 })
      .limit(Math.min(limit, 100_000))
      .toArray();
    return rows.map((r) => docToApi(parseDoc(r)));
  }
  return Array.from(memoryById.values())
    .filter((d) => d.walletAddress === w)
    .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime())
    .slice(0, limit)
    .map(docToApi);
}

export async function updateTradeJournalNotes(
  walletAddress: string,
  id: string,
  notes: string,
): Promise<TradeJournalEntry | null> {
  const w = walletAddress.toLowerCase();
  const c = coll();
  if (c) {
    const ur = await c.updateOne(
      { id, walletAddress: w },
      { $set: { notes: String(notes).slice(0, 4000) } },
    );
    if (ur.matchedCount === 0) return null;
    const v = await c.findOne({ id, walletAddress: w });
    if (!v) return null;
    return docToApi(parseDoc(v as Document));
  }
  const mem = memoryById.get(id);
  if (!mem || mem.walletAddress !== w) return null;
  mem.notes = String(notes).slice(0, 4000);
  return docToApi(mem);
}

export async function closeLatestOpenJournalEntry(input: {
  walletAddress: string;
  coin: string;
  side: "long" | "short";
  exitPrice: number;
  realizedPnl: number;
}): Promise<TradeJournalEntry | null> {
  const w = input.walletAddress.toLowerCase();
  const c = coll();
  const now = new Date();

  if (c) {
    const found = await c.findOne(
      {
        walletAddress: w,
        coin: input.coin,
        side: input.side,
        status: "open",
      },
      { sort: { openedAt: -1 } },
    );
    if (!found) return null;
    const id = String((found as Document).id);
    const ur = await c.updateOne(
      { id, walletAddress: w },
      {
        $set: {
          status: "closed" as const,
          exitPrice: input.exitPrice,
          realizedPnl: input.realizedPnl,
          closedAt: now,
        },
      },
    );
    if (ur.matchedCount === 0) return null;
    const v = await c.findOne({ id, walletAddress: w });
    if (!v) return null;
    return docToApi(parseDoc(v as Document));
  }

  const candidates = Array.from(memoryById.values()).filter(
    (d) =>
      d.walletAddress === w &&
      d.coin === input.coin &&
      d.side === input.side &&
      d.status === "open",
  );
  candidates.sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  const mem = candidates[0];
  if (!mem) return null;
  mem.status = "closed";
  mem.exitPrice = input.exitPrice;
  mem.realizedPnl = input.realizedPnl;
  mem.closedAt = now;
  return docToApi(mem);
}

export async function getTradeJournalStats(walletAddress: string): Promise<TradeJournalStats> {
  const w = walletAddress.toLowerCase();
  const c = coll();
  const storageBackend = c ? "mongodb" : "memory";

  if (c) {
    const openTradesCount = await c.countDocuments({ walletAddress: w, status: "open" });
    const agg = await c
      .aggregate<{
        n: number;
        wins: number;
        totalPnl: number;
        rrSum: number;
        rrCnt: number;
      }>([
        { $match: { walletAddress: w, status: "closed", realizedPnl: { $ne: null, $exists: true } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            wins: { $sum: { $cond: [{ $gt: ["$realizedPnl", 0] }, 1, 0] } },
            totalPnl: { $sum: "$realizedPnl" },
            rrSum: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ne: ["$rewardRiskRatio", null] }, { $gt: ["$rewardRiskRatio", 0] }],
                  },
                  "$rewardRiskRatio",
                  0,
                ],
              },
            },
            rrCnt: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $ne: ["$rewardRiskRatio", null] }, { $gt: ["$rewardRiskRatio", 0] }],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();

    const row = agg[0];
    const closedTradesCount = row?.n ?? 0;
    if (closedTradesCount === 0) {
      return {
        winRatePercent: null,
        avgRewardRisk: null,
        totalProfitLoss: null,
        closedTradesCount: 0,
        openTradesCount,
        storageBackend,
      };
    }

    const wins = row!.wins;
    const winRatePercent = (wins / closedTradesCount) * 100;
    const rrCnt = row!.rrCnt;
    const avgRewardRisk = rrCnt > 0 ? row!.rrSum / rrCnt : null;

    return {
      winRatePercent,
      avgRewardRisk,
      totalProfitLoss: row!.totalPnl,
      closedTradesCount,
      openTradesCount,
      storageBackend,
    };
  }

  const entries = await listTradeJournalEntries(walletAddress, 100_000);
  const closed = entries.filter((e) => e.status === "closed" && e.realizedPnl != null);
  const openTradesCount = entries.filter((e) => e.status === "open").length;

  if (closed.length === 0) {
    return {
      winRatePercent: null,
      avgRewardRisk: null,
      totalProfitLoss: null,
      closedTradesCount: 0,
      openTradesCount,
      storageBackend,
    };
  }

  const wins = closed.filter((e) => (e.realizedPnl ?? 0) > 0).length;
  const winRatePercent = (wins / closed.length) * 100;

  const rrVals = closed
    .map((e) => e.rewardRiskRatio)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avgRewardRisk =
    rrVals.length > 0 ? rrVals.reduce((a, b) => a + b, 0) / rrVals.length : null;

  const totalProfitLoss = closed.reduce((s, e) => s + (e.realizedPnl ?? 0), 0);

  return {
    winRatePercent,
    avgRewardRisk,
    totalProfitLoss,
    closedTradesCount: closed.length,
    openTradesCount,
    storageBackend,
  };
}
