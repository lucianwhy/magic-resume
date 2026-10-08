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

test("AI profile operations preserve omitted keys, retry generated IDs and deleted profiles, and enforce assignments", async () => {
  const mutation = randomUUID();
  const operation = { action: "upsert", profile: { provider: "qwen", apiKey: "synthetic-operation-key", model: "qwen3-vl-plus" } };
  const created = await repo.mutateAI(operation, 0, mutation, storageId);
  assert.deepEqual(await repo.mutateAI(operation, 0, mutation, storageId), created);
  const id = created.value.models[0].id;
  const edited = await repo.mutateAI({ action: "upsert", profile: { id, name: "保留凭据" } }, created.revision, randomUUID(), storageId);
  assert.equal(edited.value.models[0].apiKey, "synthetic-operation-key");
  const assigned = await repo.mutateAI({ action: "assign", task: "pdf", modelId: id }, edited.revision, randomUUID(), storageId);
  assert.equal(assigned.value.pdfModelId, id);
  await assert.rejects(repo.mutateAI({ action: "delete", modelId: id }, edited.revision, randomUUID(), storageId), { code: "settingsConflict" });
  await assert.rejects(repo.mutateAI({ action: "delete", modelId: id }, assigned.revision, randomUUID(), randomUUID()), { code: "databaseChanged" });
  const removal = randomUUID();
  const deleted = await repo.mutateAI({ action: "delete", modelId: id }, assigned.revision, removal, storageId);
  assert.deepEqual(await repo.mutateAI({ action: "delete", modelId: id }, assigned.revision, removal, storageId), deleted);
  assert.equal(deleted.value.models.length, 0); assert.equal(deleted.value.pdfModelId, null);
});

test("AI control reads hide keys and provider calls resolve credentials by model id", async () => {
  const { handleAIControl } = await import("../src/lib/server/ai-control-api");
  await repo.mutateAI({ action: "upsert", profile: { id: "model-1", provider: "qwen", apiKey: "synthetic-private-key", model: "qwen3-vl-plus" } }, 0, randomUUID(), storageId);
  const read = await handleAIControl(new Request("http://127.0.0.1/api/workspace/ai-control"), repo);
  const publicData = await read.json();
  assert.equal(publicData.models[0].hasApiKey, true); assert.equal(publicData.models[0].apiKey, undefined);
  const request = (action: string, kind?: string) => new Request("http://127.0.0.1/api/workspace/ai-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, modelId: "model-1", ...(kind ? { kind } : {}) }) });
  const tested = await handleAIControl(request("test"), repo, async (_url, options) => {
    assert.equal((options!.headers as Record<string, string>).Authorization, "Bearer synthetic-private-key");
    return Response.json({ choices: [{ message: { content: "OK" } }] });
  });
  assert.deepEqual(await tested.json(), { ok: true });
  const discovered = await handleAIControl(request("discover"), repo, async () => Response.json({ data: [{ id: "model-from-service", owned_by: "synthetic-private-key" }] }));
  const catalogue = await discovered.text(); assert.ok(!catalogue.includes("synthetic-private-key")); assert.match(catalogue, /model-from-service/);
  const failed = await handleAIControl(request("test"), repo, async () => Response.json({ error: "synthetic-private-key" }, { status: 401 }));
  assert.equal(failed.status, 401); assert.ok(!(await failed.text()).includes("synthetic-private-key"));
  const vision = await handleAIControl(request("test", "pdf"), repo, async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    assert.match(JSON.stringify(body), /data:image\/png;base64/);
    return Response.json({ choices: [{ message: { content: '{"code":"incorrect"}' } }] });
  });
  assert.equal(vision.status, 502); assert.equal((await vision.json()).code, "visionTestFailed");
  assert.equal((await handleAIControl(new Request("http://127.0.0.1/api/workspace/ai-control", { headers: { Origin: "https://evil.example" } }), repo)).status, 403);
});
