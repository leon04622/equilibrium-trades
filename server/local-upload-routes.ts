import type { Express, Request, Response } from "express";
import express from "express";
import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import parseRange from "range-parser";

/**
 * Presigned-style upload flow without GCS: same JSON shape as Replit object storage
 * so the client can keep using useUpload (POST metadata → PUT bytes → GET by objectPath).
 */
const UPLOAD_VIDEOS_DIR = path.join(process.cwd(), "uploads", "videos");

type Pending = { ext: string; contentType: string; createdAt: number };

const pendingVideoUploads = new Map<string, Pending>();

function sweepPending() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, p] of pendingVideoUploads) {
    if (p.createdAt < cutoff) pendingVideoUploads.delete(id);
  }
}

async function resolveUploadedFile(id: string): Promise<string | null> {
  try {
    const names = await fs.readdir(UPLOAD_VIDEOS_DIR);
    const hit = names.find((n) => n.startsWith(`${id}.`) || n === id);
    if (!hit) return null;
    return path.join(UPLOAD_VIDEOS_DIR, hit);
  } catch {
    return null;
  }
}

function contentTypeForVideoFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".ogv": "video/ogg",
  };
  return map[ext] || "application/octet-stream";
}

async function sendVideoFileWithRange(req: Request, res: Response, filePath: string): Promise<void> {
  const statResult = await fs.stat(filePath);
  const fileSize = statResult.size;
  const contentType = contentTypeForVideoFile(filePath);
  const rangeHeader = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  if (rangeHeader) {
    const parsed = parseRange(fileSize, rangeHeader);
    if (parsed === -1) {
      res.status(416);
      res.setHeader("Content-Range", `bytes */${fileSize}`);
      res.end();
      return;
    }
    if (parsed !== -2 && Array.isArray(parsed) && parsed.length > 0) {
      const { start, end } = parsed[0];
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Content-Length", chunkSize);
      res.setHeader("Content-Type", contentType);
      const stream = createReadStream(filePath, { start, end });
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else stream.destroy();
      });
      stream.pipe(res);
      return;
    }
  }

  res.status(200);
  res.setHeader("Content-Length", fileSize);
  res.setHeader("Content-Type", contentType);
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else stream.destroy();
  });
  stream.pipe(res);
}

export function registerLocalUploadRoutes(app: Express): void {
  void fs.mkdir(UPLOAD_VIDEOS_DIR, { recursive: true }).catch(() => {});

  app.post("/api/uploads/request-url", async (req: Request, res: Response) => {
    sweepPending();
    const { name, size, contentType } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    await fs.mkdir(UPLOAD_VIDEOS_DIR, { recursive: true });

    const id = randomUUID();
    const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(base) || ".bin";

    pendingVideoUploads.set(id, {
      ext,
      contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
      createdAt: Date.now(),
    });

    const uploadURL = `/api/uploads/stream/${id}`;
    const objectPath = `/api/uploads/files/${id}`;

    res.json({
      uploadURL,
      objectPath,
      metadata: { name, size, contentType },
    });
  });

  app.put(
    "/api/uploads/stream/:id",
    express.raw({ limit: 512 * 1024 * 1024, type: () => true }),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const pending = pendingVideoUploads.get(id);
      if (!pending) {
        return res.status(404).json({ error: "Upload session expired or invalid" });
      }

      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: "Empty upload body" });
      }

      const filename = `${id}${pending.ext}`;
      const fullPath = path.join(UPLOAD_VIDEOS_DIR, filename);
      await fs.writeFile(fullPath, buf);
      pendingVideoUploads.delete(id);
      res.status(204).end();
    },
  );

  app.head("/api/uploads/files/:id", async (req: Request, res: Response) => {
    const filePath = await resolveUploadedFile(req.params.id);
    if (!filePath) {
      return res.status(404).end();
    }
    try {
      const statResult = await fs.stat(filePath);
      res.status(200);
      res.setHeader("Content-Length", statResult.size);
      res.setHeader("Content-Type", contentTypeForVideoFile(filePath));
      res.setHeader("Accept-Ranges", "bytes");
      res.end();
    } catch {
      res.status(500).end();
    }
  });

  app.get("/api/uploads/files/:id", async (req: Request, res: Response) => {
    const filePath = await resolveUploadedFile(req.params.id);
    if (!filePath) {
      return res.status(404).json({ error: "File not found or upload incomplete" });
    }

    try {
      await sendVideoFileWithRange(req, res, path.resolve(filePath));
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to send file" });
      }
    }
  });
}
