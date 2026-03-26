import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

/**
 * Shown in logs and optional API responses when the server runs without Postgres.
 * Supabase: Project Settings → Database → Connection string (URI), often port 5432 or pooler 6543.
 */
export const DATABASE_URL_MISSING_MESSAGE =
  "DATABASE_URL (or MONGODB_URI as a Postgres URI fallback) is not set. Add a PostgreSQL connection string to .env (e.g. Supabase URI). " +
  "The server will start using in-memory fallbacks; wallet/chat/video persistence and Stripe catalog queries need a database.";

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

function initDatabase(): void {
  const url = (process.env.DATABASE_URL || process.env.MONGODB_URI || "").trim();
  if (!url) {
    console.warn(`[db] ${DATABASE_URL_MISSING_MESSAGE}`);
    return;
  }

  if (!process.env.DATABASE_URL?.trim() && process.env.MONGODB_URI?.trim()) {
    console.warn(
      "[db] Using MONGODB_URI as the Postgres connection string (this app uses PostgreSQL, not MongoDB). Prefer DATABASE_URL.",
    );
  }

  try {
    pool = createPool(url);
    db = drizzle(pool, { schema });
    console.log("[db] PostgreSQL pool ready (node-postgres; compatible with Supabase, Neon pooled URI, standard Postgres).");
  } catch (err) {
    console.error("[db] Failed to initialize database pool:", err);
    pool = null;
    db = null;
  }
}

initDatabase();

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
