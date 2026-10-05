#!/usr/bin/env node
// A real, persistent PostgreSQL development cluster; no Docker or global install.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.umask(0o077);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const runtime = join(root, "tools/local-postgres");
const local = join(root, ".local/postgres");
const dataDir = join(local, "data");
const configPath = join(local, "config.json");
const logPath = join(local, "postgres.log");
const envPath = join(root, ".env.local");
const command = process.argv[2] ?? "status";

if (!["start", "stop", "status", "check"].includes(command)) {
  console.error("Usage: node scripts/postgres-local.mjs start|stop|status|check");
  process.exit(1);
}

const requireRuntime = createRequire(join(runtime, "package.json"));
try {
  requireRuntime.resolve("embedded-postgres");
} catch {
  if (command !== "start") {
    console.error("PostgreSQL runtime is not installed. Run pnpm db:start first.");
    process.exit(1);
  }
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "ci", "--no-audit", "--no-fund",
  ], { cwd: runtime, stdio: "inherit" });
}

const moduleUrl = pathToFileURL(requireRuntime.resolve("embedded-postgres"));
const { default: EmbeddedPostgres } = await import(moduleUrl.href);
const { default: getBinaries } = await import(new URL("./binary.js", moduleUrl).href);
const binaries = await getBinaries();

function pgCtl(args, quiet = false) {
  const result = spawnSync(binaries.pg_ctl, ["-D", dataDir, ...args], {
    encoding: "utf8", timeout: 40_000,
  });
  if (result.error) throw result.error;
  if (!quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return result;
}

function isRunning() {
  if (!existsSync(join(dataDir, "PG_VERSION"))) return false;
  const result = pgCtl(["status"], true);
  if (result.status === 0) return true;
  if (result.status === 3) return false;
  throw new Error(result.stderr || "Could not inspect the project PostgreSQL cluster.");
}

function connectionUrl(config) {
  return `postgresql://${config.user}:${config.password}@127.0.0.1:${config.port}/${config.database}`;
}

async function verify(config, cluster) {
  const client = cluster.getPgClient(config.database, "127.0.0.1");
  try {
    await client.connect();
    const { rows } = await client.query("SELECT version(), current_database() AS database, inet_server_addr()::text AS host, inet_server_port() AS port");
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE magic_resume_connection_check (document jsonb)");
    await client.query("INSERT INTO magic_resume_connection_check VALUES ($1::jsonb)", [JSON.stringify({ name: "简历数据库验证", revision: 1 })]);
    const check = await client.query("SELECT document->>'name' AS name FROM magic_resume_connection_check");
    if (check.rows[0]?.name !== "简历数据库验证") throw new Error("JSONB round-trip verification failed.");
    await client.query("ROLLBACK");
    console.log(JSON.stringify({ ...rows[0], jsonbReadWrite: "passed", dataDirectory: dataDir }, null, 2));
  } finally {
    await client.end();
  }
}

async function ensurePortAvailable(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () => reject(new Error(`127.0.0.1:${port} is occupied. Choose MAGIC_RESUME_PG_PORT before the first start.`)));
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

try {
  if (command === "stop") {
    if (!isRunning()) console.log("Project PostgreSQL is already stopped; data is preserved.");
    else if (pgCtl(["-m", "fast", "-w", "stop"]).status !== 0) throw new Error("PostgreSQL stop failed.");
    process.exit(0);
  }

  if (!existsSync(configPath)) {
    if (command !== "start") throw new Error("Project PostgreSQL is not initialized. Run pnpm db:start.");
    const port = Number(process.env.MAGIC_RESUME_PG_PORT || 5432);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("MAGIC_RESUME_PG_PORT must be an integer between 1024 and 65535.");
    await ensurePortAvailable(port);
    mkdirSync(local, { recursive: true, mode: 0o700 });
    writeFileSync(configPath, JSON.stringify({
      user: "magic_resume", password: randomBytes(24).toString("hex"),
      port, database: "magic_resume",
    }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  }

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir, user: config.user, password: config.password,
    port: config.port, persistent: true, authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (command === "start") {
    // Preserve unrelated environment settings, and never overwrite another DB URL.
    const url = connectionUrl(config);
    const currentEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const existingUrl = currentEnv.match(/^DATABASE_URL\s*=\s*(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (existingUrl && existingUrl !== url) throw new Error(".env.local already has another DATABASE_URL; it was preserved. Use the connection settings in .local/postgres/config.json.");

    if (!existsSync(join(dataDir, "PG_VERSION"))) {
      await cluster.initialise();
      writeFileSync(join(dataDir, "postgresql.auto.conf"),
        `listen_addresses = '127.0.0.1'\nport = ${config.port}\nunix_socket_directories = ''\n`, { mode: 0o600 });
    }
    if (!isRunning()) {
      await ensurePortAvailable(config.port);
      const result = pgCtl(["-l", logPath, "-t", "30", "-w", "start"]);
      if (result.status !== 0) throw new Error(`PostgreSQL start failed. See ${logPath}`);
    } else console.log("Project PostgreSQL is already running.");

    const admin = cluster.getPgClient("postgres", "127.0.0.1");
    try {
      await admin.connect();
      const result = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [config.database]);
      if (!result.rowCount) await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(config.database)}`);
    } finally {
      await admin.end();
    }
    if (!existingUrl) writeFileSync(envPath, currentEnv + (currentEnv && !currentEnv.endsWith("\n") ? "\n" : "") + `DATABASE_URL=${url}\n`, { mode: 0o600 });
    console.log(`Connection URL saved to ${envPath}; password is not printed.`);
  } else if (!isRunning()) throw new Error("Project PostgreSQL is stopped. Run pnpm db:start.");

  await verify(config, cluster);
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
}
