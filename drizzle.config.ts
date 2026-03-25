import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env / .env.local so `npm run db:push` works without exporting vars manually
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.error(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DATABASE_URL is required for drizzle-kit push.

  1. Copy .env.example to .env (if needed)
  2. Set DATABASE_URL to your Postgres URI
     • Supabase: Settings → Database → Connection string (URI)
     • Use the "Session" or "Transaction" pooler URL if direct 5432 is blocked
  3. Run: npm run db:push
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  throw new Error("DATABASE_URL is not set — cannot run migrations (see message above)");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
