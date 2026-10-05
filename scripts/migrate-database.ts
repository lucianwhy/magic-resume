import { existsSync } from "node:fs";
import { getDatabase, closeDatabase } from "../src/lib/server/database";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
try {
  await migrateResumeDatabase(getDatabase());
  console.log("Resume database migrations applied successfully.");
} catch {
  console.error("Database migration failed. Check DATABASE_URL, database availability and migration checksums.");
  process.exitCode = 1;
} finally { await closeDatabase(); }
