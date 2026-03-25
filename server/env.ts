import { config } from "dotenv";

// Load before any module that reads process.env.DATABASE_URL (e.g. ./db)
config({ path: ".env.local" });
config({ path: ".env" });
