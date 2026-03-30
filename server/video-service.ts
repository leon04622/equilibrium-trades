/**
 * Educational Vault — MongoDB is the source of truth for `/api/videos`.
 * Primary collection defaults to `videos` (override with MONGO_VIDEOS_COLLECTION).
 * Reads merge legacy `tutorial_videos` (and the non-primary of `videos`/`tutorial_videos`) so older data still appears.
 */
import type { Db, Document } from "mongodb";
import { ObjectId } from "mongodb";
import { getPublicAppBaseUrl } from "./public-url";

export const PRIMARY_VIDEOS_COLLECTION =
  process.env.MONGO_VIDEOS_COLLECTION?.trim() || "videos";

const WRITE_CONCERN = { w: "majority" as const, journal: true };

export type VaultVideoUpsertInput = {
  id?: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  youtubeId: string | undefined;
  videoPath: string | undefined;
  thumbnailPath: string | undefined;
  academySection: string;
};

function absolutizeMediaUrl(pathOrUrl: string | null | undefined, origin: string): string | null {
  if (pathOrUrl == null || String(pathOrUrl).trim() === "") return null;
  const s = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = origin.replace(/\/$/, "");
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
}

/** Stable API id: explicit `id` on doc, else `_id` hex (legacy rows). */
export function vaultVideoDocToApi(doc: Document & { _id: ObjectId }, publicOrigin?: string): Record<string, unknown> {
  const created = doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt || Date.now());
  const origin = (publicOrigin || getPublicAppBaseUrl()).replace(/\/$/, "");
  const idStr = doc.id != null && String(doc.id).trim() !== "" ? String(doc.id) : doc._id.toString();
  return {
    id: idStr,
    title: String(doc.title ?? ""),
    description: String(doc.description ?? ""),
    duration: String(doc.duration ?? ""),
    category: String(doc.category ?? ""),
    youtubeId: doc.youtubeId != null ? String(doc.youtubeId) : null,
    videoPath: absolutizeMediaUrl(doc.videoPath != null ? String(doc.videoPath) : null, origin),
    thumbnailPath: absolutizeMediaUrl(doc.thumbnailPath != null ? String(doc.thumbnailPath) : null, origin),
    academySection: doc.academySection != null ? String(doc.academySection) : null,
    createdAt: created.toISOString(),
  };
}

function legacyCollectionNames(primary: string): string[] {
  const candidates = ["tutorial_videos", "videos"];
  return candidates.filter((c) => c !== primary);
}

/**
 * All vault rows for GET /api/videos: primary collection first, then legacy merges, deduped by API id.
 */
export async function listAllVaultVideos(db: Db, requestOrigin: string): Promise<Record<string, unknown>[]> {
  const primary = PRIMARY_VIDEOS_COLLECTION;
  const order: string[] = [primary, ...legacyCollectionNames(primary)];
  const seen = new Set<string>();
  const merged: Document[] = [];

  for (const name of order) {
    const coll = db.collection(name);
    const docs = await coll.find({}).sort({ createdAt: -1 }).toArray();
    for (const d of docs) {
      const _id = d._id instanceof ObjectId ? d._id : new ObjectId(String(d._id));
      const apiId =
        d.id != null && String(d.id).trim() !== "" ? String(d.id).trim() : _id.toString();
      if (seen.has(apiId)) continue;
      seen.add(apiId);
      merged.push(d);
    }
  }

  merged.sort((a, b) => {
    const ta =
      a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(String(a.createdAt || 0)).getTime();
    const tb =
      b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(String(b.createdAt || 0)).getTime();
    return tb - ta;
  });

  return merged.map((d) =>
    vaultVideoDocToApi(d as Document & { _id: ObjectId }, requestOrigin),
  );
}

/**
 * Upsert into the primary videos collection. Persists string `id` for `updateOne({ id })`-style tooling.
 * Uses majority write concern so callers only toast after durable acknowledgment.
 */
export async function upsertVaultVideo(db: Db, row: VaultVideoUpsertInput): Promise<Document & { _id: ObjectId }> {
  const coll = db.collection(PRIMARY_VIDEOS_COLLECTION);
  const now = new Date();
  const rawId = row.id?.trim();
  let _id: ObjectId;
  if (rawId && ObjectId.isValid(rawId)) {
    _id = new ObjectId(rawId);
  } else {
    _id = new ObjectId();
  }
  const idString = _id.toString();

  const $set: Record<string, unknown> = {
    title: row.title,
    description: row.description,
    duration: row.duration,
    category: row.category,
    youtubeId: row.youtubeId ?? null,
    videoPath: row.videoPath ?? null,
    thumbnailPath: row.thumbnailPath ?? null,
    academySection: row.academySection,
    id: idString,
    updatedAt: now,
  };

  const r = await coll.updateOne(
    { _id },
    {
      $set: $set,
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, writeConcern: WRITE_CONCERN },
  );

  const effectiveId = r.upsertedId instanceof ObjectId ? r.upsertedId : _id;
  const saved = await coll.findOne({ _id: effectiveId });
  if (!saved || !(saved._id instanceof ObjectId)) {
    throw new Error("Mongo upsert did not return a persisted video document");
  }
  return saved as Document & { _id: ObjectId };
}

export async function deleteVaultVideoById(db: Db, rawId: string): Promise<boolean> {
  const names = [PRIMARY_VIDEOS_COLLECTION, ...legacyCollectionNames(PRIMARY_VIDEOS_COLLECTION)];
  for (const name of names) {
    const c = db.collection(name);
    if (ObjectId.isValid(rawId)) {
      const dr = await c.deleteOne({ $or: [{ _id: new ObjectId(rawId) }, { id: rawId }] });
      if (dr.deletedCount > 0) return true;
    } else {
      const dr = await c.deleteOne({ id: rawId });
      if (dr.deletedCount > 0) return true;
    }
  }
  return false;
}
