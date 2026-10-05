import assert from "node:assert/strict";
import test, { before, after, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";
import { WorkspaceRepository, handleWorkspaceSettings } from "../src/lib/server/workspace-settings-api";
import { createModelProfile } from "../src/config/ai-models";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const name = `magic_resume_settings_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool, pool: pg.Pool, repo: WorkspaceRepository, storageId: string;
const ai = (key = "synthetic-secret") => ({ models: [{ ...createModelProfile("qwen", "shared"), apiKey: key, model: "qwen3-vl-plus" }], textModelId: "shared", pdfModelId: "shared" });
before(async () => {
  assert.ok(process.env.DATABASE_URL);
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL }); await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`;
  pool = new pg.Pool({ connectionString: url.toString() }); await migrateResumeDatabase(pool);
  repo = new WorkspaceRepository(pool); storageId = (await repo.list()).storageId;
});
beforeEach(async () => { await pool.query("TRUNCATE workspace_settings, workspace_settings_imports"); });
after(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end(); } });

test("AI credentials, assignments and preferences persist in JSONB", async () => {
  const saved = await repo.put("ai", ai(), 0, randomUUID(), storageId);
  assert.equal(saved.revision, 1);
  assert.equal((await repo.list()).entries.ai?.value.models[0].apiKey, "synthetic-secret");
  await repo.put("preferences", { theme: "dark", locale: "en", activeResumeId: "resume-1" }, 0, randomUUID(), storageId);
  assert.equal((await repo.list()).entries.preferences?.value.locale, "en");
});
test("concurrent settings edits conflict, errors do not contain credentials", async () => {
  await repo.put("ai", ai(), 0, randomUUID(), storageId);
  const results = await Promise.allSettled([repo.put("ai", ai("A"), 1, randomUUID(), storageId), repo.put("ai", ai("B"), 1, randomUUID(), storageId)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const error = (results.find(r => r.status === "rejected") as PromiseRejectedResult).reason;
  assert.equal(error.code, "settingsConflict"); assert.equal(error.current, undefined);
});
test("settings writes retry after lost acknowledgement without changing revision", async () => {
  const mutationId = randomUUID(); const first = await repo.put("ai", ai(), 0, mutationId, storageId);
  assert.deepEqual(await repo.put("ai", ai(), 0, mutationId, storageId), first);
  await assert.rejects(repo.put("ai", ai("different"), 1, mutationId, storageId), { code: "settingsConflict" });
  await assert.rejects(repo.put("ai", ai(), 1, randomUUID(), randomUUID()), { code: "databaseChanged" });
});
test("legacy migration is idempotent and never resurrects a removed model", async () => {
  const old = ai(); await repo.importLegacy({ ai: old, preferences: { theme: "dark" } });
  const first = (await repo.list()).entries.ai!;
  await repo.importLegacy({ ai: old, preferences: { theme: "light" } });
  assert.equal((await repo.list()).entries.ai?.revision, first.revision);
  assert.equal((await repo.list()).entries.preferences?.value.theme, "dark");
  await repo.put("ai", { models: [], textModelId: null, pdfModelId: null }, first.revision, randomUUID(), storageId);
  await repo.importLegacy({ ai: old });
  assert.equal((await repo.list()).entries.ai?.value.models.length, 0);
});
test("conflicting legacy models are retained under new IDs, existing assignments win", async () => {
  await repo.put("ai", ai("current-secret"), 0, randomUUID(), storageId);
  await repo.importLegacy({ ai: ai("old-secret") });
  const value = (await repo.list()).entries.ai!.value;
  assert.equal(value.models.length, 2); assert.equal(value.textModelId, "shared");
  assert.equal(value.models[0].apiKey, "current-secret");
  assert.notEqual(value.models[1].id, "shared");
  assert.equal((await pool.query("SELECT count(*) FROM workspace_settings_imports")).rows[0].count, "1");
});
test("directory metadata persists without treating it as a browser capability", async () => {
  await repo.put("file-sync", { directoryName: "backup", configured: true, mode: "readwrite", authorizedAt: new Date().toISOString() }, 0, randomUUID(), storageId);
  assert.equal((await repo.list()).entries["file-sync"]?.value.directoryName, "backup");
  await assert.rejects(repo.put("file-sync", { directoryName: "backup", configured: true, mode: "readwrite", handle: {} }, 1, randomUUID(), storageId), { code: "invalidSettings" });
});
test("settings API guards origin, rejects malformed input and redacts errors", async () => {
  const req = (body: unknown, headers = {}) => new Request("http://127.0.0.1/api/workspace/ai", { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await handleWorkspaceSettings(req({}, { Origin: "https://evil.example" }), "ai", repo)).status, 403);
  assert.equal((await handleWorkspaceSettings(new Request("https://example.com/api/workspace/"), undefined, repo)).status, 403);
  assert.equal((await handleWorkspaceSettings(req({ value: ai(), expectedRevision: 0, mutationId: randomUUID(), storageId }), "ai", repo)).status, 200);
  const response = await handleWorkspaceSettings(req({ value: ai(), expectedRevision: 0, mutationId: randomUUID(), storageId }), "ai", repo);
  assert.equal(response.status, 409); assert.ok(!(await response.text()).includes("synthetic-secret"));
  const invalid = await handleWorkspaceSettings(req({ value: { models: [{}] }, expectedRevision: 0, mutationId: randomUUID(), storageId }), "ai", repo);
  assert.equal(invalid.status, 400);
  const wrongKeyType = ai(); (wrongKeyType.models[0] as any).apiKey = 42;
  await assert.rejects(repo.put("ai", wrongKeyType, 1, randomUUID(), storageId), { code: "invalidSettings" });
});
