import type { Express, Request, Response } from "express";
import express from "express";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

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

  app.get("/api/uploads/files/:id", async (req: Request, res: Response) => {
    const filePath = await resolveUploadedFile(req.params.id);
    if (!filePath) {
      return res.status(404).json({ error: "File not found or upload incomplete" });
    }

    try {
      res.sendFile(path.resolve(filePath), (err) => {
        if (err && !res.headersSent) {
          res.status(500).json({ error: "Failed to send file" });
        }
      });
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to send file" });
      }
    }
  });
}
