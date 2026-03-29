import "./env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { heatmapWSManager } from "./heatmap-ws";
import { attachCommandCenterDebugWs } from "./admin-debug-ws";
import { attachSupportChatWs } from "./support-chat-ws";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { getDatabaseStatus, ensurePostgresCoreTables } from './db';
import { getMongoVaultHealth, pingMongoVault, resolveMongoVaultUri } from "./mongo-vault";
import { getPublicAppBaseUrl } from "./public-url";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    log('DATABASE_URL not found, skipping Stripe initialization', 'stripe');
    return;
  }

  try {
    log('Initializing Stripe schema...', 'stripe');
    await runMigrations({ 
      databaseUrl
    });
    log('Stripe schema ready', 'stripe');

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = getPublicAppBaseUrl();
    if (!webhookBaseUrl.startsWith("https://")) {
      log(
        "Skipping managed Stripe webhook auto-setup (need https). Set PUBLIC_APP_URL=https://your.domain and configure /api/stripe/webhook in Stripe Dashboard for production.",
        "stripe"
      );
    } else {
      log("Setting up managed webhook...", "stripe");
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        if (result?.webhook) {
          log(`Webhook configured: ${result.webhook.url}`, "stripe");
        } else {
          log(
            "Webhook setup returned no webhook object, continuing without managed webhook",
            "stripe"
          );
        }
      } catch (webhookError: any) {
        log(`Webhook setup error (non-fatal): ${webhookError.message}`, "stripe");
      }
    }

    log('Syncing Stripe data...', 'stripe');
    stripeSync.syncBackfill()
      .then(() => {
        log('Stripe data synced', 'stripe');
      })
      .catch((err: any) => {
        log(`Error syncing Stripe data: ${err.message}`, 'stripe');
      });
  } catch (error: any) {
    log(`Failed to initialize Stripe: ${error.message}`, 'stripe');
  }
}

(async () => {
  await initStripe();
  await ensurePostgresCoreTables();

  // Redirect apex domain to www only
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host;
    if (host === 'equilibrium-trading.xyz') {
      return res.redirect(301, `https://www.equilibrium-trading.xyz${req.url}`);
    }
    next();
  });

  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(400).json({ error: 'Missing stripe-signature' });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          log('STRIPE WEBHOOK ERROR: req.body is not a Buffer', 'stripe');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
        res.status(200).json({ received: true });
      } catch (error: any) {
        log(`Webhook error: ${error.message}`, 'stripe');
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  app.use(
    express.json({
      verify: (req, _res, buf) => {   
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  if (process.env.NODE_ENV === "production") {
    app.use((_req, res, next) => {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: https: blob:",
          "connect-src 'self' https: wss: data:",
          "media-src 'self' blob: https: data:",
          "worker-src 'self' blob:",
          "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://vimeo.com",
        ].join("; "),
      );
      next();
    });
  }

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  // ── Health check (required by Replit autoscale) ──
  app.get("/health", (_req, res) => {
    const dbStatus = getDatabaseStatus();
    const mongoVault = getMongoVaultHealth();
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        configured: dbStatus.configured,
        ...(dbStatus.message ? { message: dbStatus.message } : {}),
      },
      mongoVault: {
        uriConfigured: mongoVault.uriConfigured,
        connected: mongoVault.connected,
        hint:
          mongoVault.uriConfigured && !mongoVault.connected
            ? "Mongo URI is set but connection failed — check logs, IP allowlist, and credentials."
            : !mongoVault.uriConfigured
              ? "Set MONGO_VAULT_URI or MONGODB_URI (mongodb:// or mongodb+srv://) for Admin vault, CRM, and support in MongoDB."
              : undefined,
      },
    });
  });

  await registerRoutes(httpServer, app);

  app.get("/api/system/status", async (_req, res) => {
    const mv = getMongoVaultHealth();
    if (!mv.connected) {
      return res.status(503).json({ database: "disconnected" });
    }
    try {
      await pingMongoVault();
      return res.json({ database: "connected" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[system/status] Mongo ping failed:", msg);
      return res.status(503).json({ database: "disconnected", error: "Database ping failed" });
    }
  });

  /** Plain-English Mongo diagnostic (visit in browser). */
  app.get("/api/debug-db", async (_req, res) => {
    if (!resolveMongoVaultUri()) {
      return res.status(200).json({
        status: "Disconnected",
        detail: "No valid MONGODB_URI (or MONGO_VAULT_URI) in environment",
      });
    }
    const mv = getMongoVaultHealth();
    if (!mv.connected) {
      return res.status(200).json({
        status: "Disconnected",
        detail: "Handshake failed after startup retries — check Atlas IP allowlist, credentials, and logs",
      });
    }
    try {
      await pingMongoVault();
      return res.status(200).json({ status: "Connected" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(200).json({ status: "Disconnected", detail: msg });
    }
  });

  attachCommandCenterDebugWs(httpServer);
  attachSupportChatWs(httpServer);
  heatmapWSManager.initialize(httpServer);

  // ── Global error handler ──
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`[error] ${status} ${message}`, err.stack || "");
    res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  // reusePort is unsupported on Windows (ENOTSUP) and not needed for local dev
  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: "0.0.0.0",
  };
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }
  httpServer.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    const d = getDatabaseStatus();
    if (!d.configured && d.message) {
      log(d.message, "db");
    }
    const mv = getMongoVaultHealth();
    if (mv.connected) {
      log("MongoDB vault (videos / CRM / support) is active.", "mongo-vault");
    } else if (mv.uriConfigured) {
      log("MongoDB vault URI is set but connection failed — check logs and Atlas IP allowlist.", "mongo-vault");
    }
  });
})();
