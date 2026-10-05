import pg from "pg";

// Lazy initialization keeps DATABASE_URL out of the client and allows startup
// environment loading before the first database request.
let pool: pg.Pool | undefined;
export function getDatabase(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
    pool.on("error", () => console.error("[resume-database] Idle connection failed"));
  }
  return pool;
}
export async function closeDatabase() { await pool?.end(); pool = undefined; }
