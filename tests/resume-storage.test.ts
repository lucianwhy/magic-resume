import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import pg from "pg";
import { blankResumeState } from "../src/config/initialResumeData";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";
import { ResumeRepository } from "../src/lib/server/resume-repository";
import { handleResumeStorage } from "../src/lib/server/resume-storage-api";
import type { ResumeData } from "../src/types/resume";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const databaseName = `magic_resume_test_${randomUUID().replaceAll("-", "")}`;
let admin: pg.Pool, pool: pg.Pool, repo: ResumeRepository;
const document = (title = "中文简历"): ResumeData => ({ ...structuredClone(blankResumeState), id: randomUUID(), title, createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-02T00:00:00.000Z", templateId: "classic", activeSection: "basic", draggingProjectId: null });
before(async () => {
  if (!process.env.DATABASE_URL) throw new Error("Run pnpm db:start first");
  admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(process.env.DATABASE_URL); url.pathname = `/${databaseName}`;
  pool = new pg.Pool({ connectionString: url.toString() });
  await migrateResumeDatabase(pool); repo = new ResumeRepository(pool);
});
after(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end(); } });

test("migrations are idempotent and preserve the database identity", async () => {
  const identity = (await repo.list()).storageId;
  await migrateResumeDatabase(pool);
  assert.equal((await repo.list()).storageId, identity);
  assert.equal((await pool.query("SELECT count(*) FROM magic_resume_schema_migrations")).rows[0].count, "3");
});

test("JSONB preserves rich text, Chinese, photos, custom sections and certificates", async () => {
  const resume = document();
  resume.basic.name = "李小明"; resume.basic.photo = "data:image/png;base64,aGVsbG8=";
  resume.skillContent = '<p><strong style="font-size: 18px">数据库</strong></p>';
  resume.customData = { extra: [{ id: "item1", title: "项目", subtitle: "", dateRange: "", description: "<p>内容</p>", visible: true }] };
  resume.certificates = [{ id: "cert1", url: resume.basic.photo, width: 50 }];
  const saved = await repo.put(resume, 0, randomUUID());
  const loaded = await repo.get(resume.id);
  assert.equal(saved.revision, 1); assert.deepEqual(loaded, saved);
  assert.deepEqual(loaded.resume.customData, resume.customData);
  assert.deepEqual(loaded.resume.certificates, resume.certificates);
  assert.equal(loaded.resume.skillContent, resume.skillContent);
  assert.equal(loaded.resume.createdAt, resume.createdAt);
});

test("concurrent writers cannot silently overwrite one another", async () => {
  const resume = document(); const saved = await repo.put(resume, 0, randomUUID());
  const results = await Promise.allSettled([
    repo.put({ ...saved.resume, title: "writer A" }, saved.revision, randomUUID()),
    repo.put({ ...saved.resume, title: "writer B" }, saved.revision, randomUUID()),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409); assert.equal(rejected.reason.current.revision, 2);
  assert.equal((await repo.get(resume.id)).revision, 2);
});

test("lost acknowledgements can retry without a second revision", async () => {
  const resume = document(); const mutation = randomUUID();
  const saved = await repo.put(resume, 0, mutation);
  assert.deepEqual(await repo.put(resume, 0, mutation), saved);
  await assert.rejects(repo.put({ ...resume, title: "changed request" }, 0, mutation), { code: "mutationIdReused" });
});

test("legacy imports are idempotent; ID collisions preserve both documents", async () => {
  const old = document("old browser");
  const current = await repo.put({ ...old, title: "new database" }, 0, randomUUID());
  const first = await repo.importLegacy([old]);
  assert.equal(first.copied, 1); assert.equal(first.imported, 1);
  const copyId = first.idMap[old.id]; assert.notEqual(copyId, old.id);
  assert.equal((await repo.get(old.id)).resume.title, current.resume.title);
  assert.equal((await repo.get(copyId)).resume.basic.name, old.basic.name);
  const second = await repo.importLegacy([old]);
  assert.equal(second.imported, 0); assert.equal(second.idMap[old.id], copyId);
});

test("deletion tombstones prevent stale writes and old backups resurrecting resumes", async () => {
  const old = document(); const saved = await repo.put(old, 0, randomUUID()); const mutation = randomUUID();
  const deleted = await repo.delete(old.id, saved.revision, mutation);
  assert.deepEqual(await repo.delete(old.id, saved.revision, mutation), deleted);
  await assert.rejects(repo.get(old.id), { status: 404 });
  await assert.rejects(repo.put(old, 0, randomUUID()), { status: 409, current: null });
  const migration = await repo.importLegacy([old]);
  assert.equal(migration.imported, 0); assert.equal(migration.skipped, 1);
  assert.deepEqual((await pool.query("SELECT source_document FROM resume_legacy_imports WHERE source_id = $1", [old.id])).rows[0].source_document, old, "skipped legacy documents retain their source backup before browser cleanup");
  await assert.rejects(repo.get(old.id), { status: 404 });
});

test("a database failure rolls back the whole legacy batch", async () => {
  const first = document("valid"); const second = document("reject transaction");
  await pool.query("ALTER TABLE resume_documents ADD CONSTRAINT storage_test_reject CHECK (document->>'title' <> 'reject transaction')");
  try {
    await assert.rejects(repo.importLegacy([first, second]));
    await assert.rejects(repo.get(first.id), { status: 404 });
    assert.equal((await pool.query("SELECT count(*) FROM resume_legacy_imports WHERE source_id = $1", [first.id])).rows[0].count, "0");
  } finally { await pool.query("ALTER TABLE resume_documents DROP CONSTRAINT storage_test_reject"); }
});

test("API rejects cross-origin access, malformed bodies, unsafe IDs and mismatched IDs", async () => {
  const request = (url: string, body: unknown, headers = {}) => new Request(url, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await handleResumeStorage(request("http://127.0.0.1/api/resumes/test", {}, { Origin: "https://evil.example" }), "test", repo)).status, 403);
  assert.equal((await handleResumeStorage(new Request("https://example.com/api/resumes"), undefined, repo)).status, 403);
  const resume = document();
  assert.equal((await handleResumeStorage(request("http://localhost/api/resumes/test", { resume, expectedRevision: 0, mutationId: randomUUID() }), "test", repo)).status, 400);
  assert.equal((await handleResumeStorage(new Request("http://localhost/api/resumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }), undefined, repo)).status, 400);
  const get = await handleResumeStorage(new Request("http://localhost/api/resumes/"), undefined, repo);
  assert.equal(get.status, 200); assert.equal(get.headers.get("Cache-Control"), "no-store");
  assert.equal((await handleResumeStorage(request("http://localhost/api/resumes/constructor", {}), "constructor", repo)).status, 400);
});

test("conditional polling detects creates, edits and deletes without resending unchanged documents", async () => {
  const list = (etag?: string) => handleResumeStorage(new Request("http://localhost/api/resumes/", { headers: etag ? { "If-None-Match": etag } : {} }), undefined, repo);
  const initial = await list(); const firstVersion = initial.headers.get("ETag")!;
  assert.ok(firstVersion);
  const unchanged = await list(firstVersion);
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), "");
  const resume = document(); const saved = await repo.put(resume, 0, randomUUID());
  const created = await list(firstVersion); assert.equal(created.status, 200);
  const createdVersion = created.headers.get("ETag")!;
  const edited = await repo.put({ ...saved.resume, title: "changed" }, saved.revision, randomUUID());
  const changed = await list(createdVersion); assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("ETag"), createdVersion);
  await repo.delete(resume.id, edited.revision, randomUUID());
  assert.equal((await list(changed.headers.get("ETag")!)).status, 200);
});
