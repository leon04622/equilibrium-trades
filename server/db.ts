import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

/**
 * Shown in logs and optional API responses when the server runs without Postgres.
 * Supabase: Project Settings → Database → Connection string (URI), often port 5432 or pooler 6543.
 */
export const DATABASE_URL_MISSING_MESSAGE =
  "DATABASE_URL is not set (or only a MongoDB URI was provided). Add a PostgreSQL connection string for Drizzle/Stripe/wallet tables (e.g. Supabase URI). " +
  "For Admin + Educational Vault on MongoDB, set MONGO_VAULT_URI or MONGODB_URI to a mongodb:// or mongodb+srv:// URL (separate from Postgres). " +
  "Without Postgres, the server still starts with in-memory fallbacks for non-Mongo routes.";

export type AppDatabase = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
export let db: AppDatabase | null = null;

function createPool(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

function looksLikeMongoConnectionString(url: string): boolean {
  return /^mongodb(\+srv)?:\/\//i.test(url.trim());
}

/** Postgres URI only — never pass MongoDB URIs to node-postgres (common misconfig). */
function resolvePostgresUrlFromEnv(): { url: string; legacyMongodNamedPostgres: boolean } {
  const explicit = process.env.DATABASE_URL?.trim() || "";
  if (explicit && looksLikeMongoConnectionString(explicit)) {
    console.warn(
      "[db] DATABASE_URL looks like MongoDB (mongodb://…). PostgreSQL will stay disabled; use postgresql:// for Postgres.",
    );
  }
  if (explicit && !looksLikeMongoConnectionString(explicit)) {
    return { url: explicit, legacyMongodNamedPostgres: false };
  }

  const legacy = process.env.MONGODB_URI?.trim() || "";
  if (legacy && !looksLikeMongoConnectionString(legacy)) {
    console.warn(
      "[db] Using MONGODB_URI as the PostgreSQL connection string (legacy alias). Prefer DATABASE_URL for Postgres.",
    );
    return { url: legacy, legacyMongodNamedPostgres: true };
  }

  if (legacy && looksLikeMongoConnectionString(legacy)) {
    console.log(
      "[db] MONGODB_URI is a MongoDB URL — skipping for PostgreSQL. Use DATABASE_URL for Postgres; vault uses Mongo separately.",
    );
  }

  return { url: "", legacyMongodNamedPostgres: false };
}

function initDatabase(): void {
  const { url } = resolvePostgresUrlFromEnv();
  if (!url) {
    console.warn(`[db] ${DATABASE_URL_MISSING_MESSAGE}`);
    return;
  }

  try {
    pool = createPool(url);
    pool.on("error", (err) => {
      console.error("[db] Unexpected error on idle PostgreSQL client (server stays up):", err);
    });
    db = drizzle(pool, { schema });
    console.log("Database Connected");
    console.log("[db] PostgreSQL pool ready (node-postgres; compatible with Supabase, Neon pooled URI, standard Postgres).");
  } catch (err) {
    console.error("[db] Failed to initialize database pool:", err);
    pool = null;
    db = null;
  }
}

initDatabase();

/**
 * Creates core tables if missing (e.g. fresh Supabase/Neon DB where `npm run db:push` was never run).
 * Matches tables in shared/schema.ts — fixes "relation … does not exist" for vault + support chat.
 */
export async function ensurePostgresCoreTables(): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tutorial_videos (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        duration text NOT NULL DEFAULT '',
        category text NOT NULL,
        youtube_id text,
        video_path text,
        thumbnail_path text,
        academy_section text,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        sender_type text NOT NULL,
        sender_wallet text,
        sender_name text,
        message text NOT NULL,
        is_read boolean DEFAULT false,
        conversation_id text NOT NULL,
        wallet_address text,
        client_sent_at timestamp,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_users (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        wallet_address text NOT NULL UNIQUE,
        email text,
        builder_code_approved boolean DEFAULT false,
        is_builder_linked boolean DEFAULT false,
        manual_pro_override boolean DEFAULT false,
        referral_builder_status text,
        instant_trading_completed_at timestamp,
        subscription_tier text DEFAULT 'free',
        subscription_active boolean DEFAULT false,
        subscription_expires_at timestamp,
        subscribed_at timestamp,
        hl_perp_account_value real,
        hl_spot_usdc real,
        hl_total_usd real,
        hl_balance_observed_at timestamp,
        cctp_bridge_progress jsonb,
        scanner_all_markets boolean DEFAULT true,
        scanner_watchlist_coins text[],
        created_at timestamp DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS hl_perp_account_value real;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS hl_spot_usdc real;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS hl_total_usd real;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS hl_balance_observed_at timestamp;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS cctp_bridge_progress jsonb;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS scanner_all_markets boolean DEFAULT true;`);
    await client.query(`ALTER TABLE wallet_users ADD COLUMN IF NOT EXISTS scanner_watchlist_coins text[];`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        email text NOT NULL,
        name text,
        source text DEFAULT 'landing',
        wallet_address text,
        created_at timestamp DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS trade_grades (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        wallet_address text NOT NULL,
        coin text NOT NULL,
        side text NOT NULL,
        entry_price real NOT NULL,
        exit_price real NOT NULL,
        stop_loss real NOT NULL,
        take_profit real NOT NULL,
        leverage real NOT NULL,
        size real NOT NULL,
        pnl real NOT NULL,
        pnl_percent real NOT NULL,
        entry_score integer NOT NULL,
        stop_score integer NOT NULL,
        rr_score integer NOT NULL,
        leverage_score integer NOT NULL,
        setup_score integer NOT NULL,
        total_score integer NOT NULL,
        setup_grade text NOT NULL,
        execution_grade text NOT NULL,
        pattern_type text,
        timeframe text,
        notes text[] NOT NULL,
        traded_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        graded_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS trade_journal_entries (
        id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text) NOT NULL,
        wallet_address text NOT NULL,
        pair text NOT NULL,
        coin text NOT NULL,
        side text NOT NULL,
        entry_price real NOT NULL,
        size real NOT NULL,
        opened_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        stop_loss real,
        take_profit real,
        leverage real NOT NULL DEFAULT 1,
        notes text NOT NULL DEFAULT '',
        pattern_status_at_entry text,
        entry_grade text NOT NULL,
        negative_rr boolean NOT NULL DEFAULT false,
        reward_risk_ratio real,
        status text NOT NULL DEFAULT 'open',
        exit_price real,
        realized_pnl real,
        closed_at timestamp
      );
    `);
    console.log("[db] Ensured tables tutorial_videos, support_tickets, wallet_users, leads, trade_grades, trade_journal_entries (CREATE IF NOT EXISTS).");
  } catch (err) {
    console.error("[db] ensurePostgresCoreTables failed:", err);
  } finally {
    client.release();
  }
}

export function isDatabaseConfigured(): boolean {
  return db !== null;
}

/** For API responses / admin UI */
export function getDatabaseStatus(): { configured: boolean; message: string | null } {
  if (db) {
    return { configured: true, message: null };
  }
  return { configured: false, message: DATABASE_URL_MISSING_MESSAGE };
}

export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
