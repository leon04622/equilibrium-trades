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
import { getDatabaseStatus } from './db';
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
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        configured: dbStatus.configured,
        ...(dbStatus.message ? { message: dbStatus.message } : {}),
      },
    });
  });

  await registerRoutes(httpServer, app);

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
    const tok = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chat = process.env.TELEGRAM_CHAT_ID?.trim();
    if (tok && chat) {
      log("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set — user support messages will push to Telegram.", "telegram");
    } else if (tok && !chat) {
      log("TELEGRAM_BOT_TOKEN set but TELEGRAM_CHAT_ID missing — configure chat id for alerts.", "telegram");
    } else {
      log("TELEGRAM_BOT_TOKEN not set — support tickets still save to DB without phone push.", "telegram");
    }
    const mongoAlias = process.env.MONGODB_URI?.trim();
    if (mongoAlias && !process.env.DATABASE_URL?.trim()) {
      log("MONGODB_URI is used as the Postgres connection string (this stack is PostgreSQL, not MongoDB).", "db");
    }
  });
})();
