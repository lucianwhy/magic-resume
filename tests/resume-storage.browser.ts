import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { chromium, type Page } from "playwright";
import pg from "pg";
import { blankResumeState } from "../src/config/initialResumeData";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const artifacts = ".local/storage-tests";
await mkdir(artifacts, { recursive: true });
async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const { useResumeStore } = await import("/src/store/useResumeStore.ts");
    const { useResumeDatabaseStatus } = await import("/src/store/useResumeDatabaseStatus.ts");
    return { resumes: useResumeStore.getState().resumes, status: useResumeDatabaseStatus.getState() };
  });
}
async function ready(page: Page) {
  await page.getByTestId("resume-storage-status").waitFor({ timeout: 60000 });
}
async function waitForState(page: Page, predicate: (value: Awaited<ReturnType<typeof state>>) => boolean) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (predicate(await state(page))) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail("Browser state did not converge within 15 seconds");
}
async function flush(page: Page) {
  await page.evaluate(async () => { const { flushResumeDatabase } = await import("/src/lib/resume-database-sync.ts"); await flushResumeDatabase(); });
}

test("database storage end to end: migration, edits, fresh browser, external update, memory-only retries and deletion", { timeout: 180000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, "Run pnpm db:start first");
  const name = `magic_resume_browser_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE DATABASE "${name}"`);
  const databaseURL = new URL(process.env.DATABASE_URL!); databaseURL.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: databaseURL.toString() }); await migrateResumeDatabase(pool);
  const port = await unusedPort(); const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { env: { ...process.env, DATABASE_URL: databaseURL.toString() }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; server.stdout.on("data", chunk => { log += chunk; }); server.stderr.on("data", chunk => { log += chunk; });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  t.after(async () => {
    await browser?.close(); server.kill("SIGTERM");
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
    await pool.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end();
    await writeFile(`${artifacts}/server.log`, log);
  });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${origin}/api/resumes/`)).ok) break; } catch { /* Vite is starting. */ }
    if (i === 119) throw new Error("Test server did not start");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => void dialog.accept());
  const resume = { ...structuredClone(blankResumeState), id: randomUUID(), title: "存储迁移验收", templateId: "classic", createdAt: "2025-02-01T00:00:00.000Z", updatedAt: "2025-02-02T00:00:00.000Z", activeSection: "skills", skillContent: "<p>旧浏览器正文</p>" };
  resume.menuSections.push({ id: "skills", title: "技能", icon: "🛠️", order: 1, enabled: true });
  const legacy = JSON.stringify({ state: { resumes: { [resume.id]: resume }, activeResumeId: resume.id }, version: 0 });
  await page.goto(`${origin}/zh`);
  const storageId = (await (await fetch(`${origin}/api/resumes/`)).json()).storageId;
  const oldQueue = JSON.stringify({ storageId, changes: [{ id: resume.id, resume: { ...resume, skillContent: "<p>旧队列未提交正文</p>" }, revision: 1, mutationId: randomUUID() }] });
  await page.evaluate(({ legacy, oldQueue }) => {
    localStorage.setItem("resume-storage", legacy);
    localStorage.setItem("resume-db-outbox-v1", oldQueue);
    localStorage.setItem("resume-db-migration-v1", "previous-receipt");
  }, { legacy, oldQueue });
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error("Browser persistence is forbidden in this test"); };
  });
  await page.route("**/api/resumes/**", route => route.request().method() === "PUT" ? route.abort("failed") : route.continue());
  await page.goto(`${origin}/app/workbench/${resume.id}`); await ready(page);
  await page.locator('.tiptap[contenteditable="true"]:visible').first().waitFor();
  assert.equal((await state(page)).resumes[resume.id].title, resume.title);
  assert.equal(await page.evaluate(() => localStorage.getItem("resume-storage")), null, "legacy backup is now in PostgreSQL");
  assert.deepEqual((await pool.query("SELECT source_document FROM resume_legacy_imports WHERE source_id=$1", [resume.id])).rows[0].source_document, resume);
  assert.equal(await page.evaluate(() => localStorage.getItem("resume-db-outbox-v1")), oldQueue, "uncommitted legacy queue must not be cleared");
  await page.unroute("**/api/resumes/**"); await flush(page);
  assert.equal((await state(page)).status.pending, 0);
  assert.match((await pool.query("SELECT document FROM resume_documents WHERE id=$1", [resume.id])).rows[0].document.skillContent, /旧队列未提交正文/);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal((await pool.query("SELECT count(*) FROM resume_documents WHERE deleted_at IS NULL")).rows[0].count, "1");

  // Edit using the real contenteditable UI, then verify committed JSONB.
  const editor = page.locator('.tiptap[contenteditable="true"]:visible').first();
  await editor.fill("编辑后的中文正文"); await flush(page);
  assert.match((await pool.query("SELECT document FROM resume_documents WHERE id = $1", [resume.id])).rows[0].document.skillContent, /编辑后的中文正文/);
  await page.reload(); await ready(page);
  await page.locator('.tiptap[contenteditable="true"]:visible').first().waitFor();
  assert.match((await state(page)).resumes[resume.id].skillContent, /编辑后的中文正文/);
  await flush(page);

  // A new browser with empty localStorage gets the same database document.
  const fresh = await browser.newContext(); const second = await fresh.newPage();
  await second.goto(`${origin}/app/dashboard/resumes`); await ready(second);
  await second.getByText(resume.title, { exact: true }).first().waitFor();
  assert.match((await state(second)).resumes[resume.id].skillContent, /编辑后的中文正文/);
  assert.equal(await second.evaluate(() => localStorage.getItem("resume-storage")), null);
  const get = () => fetch(`${origin}/api/resumes/${resume.id}`).then(response => response.json());
  const current = await get();
  const put = await fetch(`${origin}/api/resumes/${resume.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: { ...current.resume, title: "外部 API 更新" }, expectedRevision: current.revision, mutationId: randomUUID() }) });
  assert.equal(put.status, 200);
  await waitForState(page, value => value.resumes[resume.id]?.title === "外部 API 更新");

  // Offline edits stay in page memory; no durable browser queue is created.
  await page.route("**/api/resumes/**", route => route.abort("failed"));
  await page.evaluate(async id => { const { useResumeStore } = await import("/src/store/useResumeStore.ts"); useResumeStore.getState().updateResume(id, { title: "断线修改" }); }, resume.id);
  await flush(page);
  assert.equal((await state(page)).status.pending, 1);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  }), true, "leaving the page warns while edits remain unsaved");
  await page.getByText("尚未保存到数据库。修改仅在当前页面内存中，离开前请重试或导出。", { exact: true }).waitFor();
  await page.unroute("**/api/resumes/**"); await flush(page);
  await page.reload(); await ready(page);
  await page.locator('.tiptap[contenteditable="true"]:visible').first().waitFor();
  const afterRecovery = await get();
  const recoveryState = await state(page);
  assert.equal(afterRecovery.resume.title, "断线修改", JSON.stringify({ revision: afterRecovery.revision, localTitle: recoveryState.resumes[resume.id]?.title, status: recoveryState.status }));
  assert.equal(await page.evaluate(() => localStorage.getItem("resume-db-outbox-v1")), null);

  // Undo history survives save acknowledgements.
  await page.evaluate(async id => {
    const { useResumeStore } = await import("/src/store/useResumeStore.ts");
    useResumeStore.getState().updateResume(id, { title: "撤销测试" });
  }, resume.id); await flush(page);
  await page.evaluate(async () => { const { useResumeStore } = await import("/src/store/useResumeStore.ts"); useResumeStore.getState().undo(); }); await flush(page);
  assert.equal((await get()).resume.title, "断线修改");
  assert.match(await page.locator('.tiptap[contenteditable="true"]:visible').first().innerText(), /编辑后的中文正文/);
  await page.screenshot({ path: `${artifacts}/database-editor.png`, fullPage: true });

  // Conflict handling retains both sides when the user chooses a copy.
  await page.route("**/api/resumes/**", route => route.abort("failed"));
  await page.evaluate(async id => { const { useResumeStore } = await import("/src/store/useResumeStore.ts"); useResumeStore.getState().updateResume(id, { title: "我的冲突版本" }); }, resume.id); await flush(page);
  const latest = await get();
  await fetch(`${origin}/api/resumes/${resume.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume: { ...latest.resume, title: "另一端的新版本" }, expectedRevision: latest.revision, mutationId: randomUUID() }) });
  await page.unroute("**/api/resumes/**");
  await page.evaluate(async () => { const { retryResumeDatabase } = await import("/src/lib/resume-database-sync.ts"); await retryResumeDatabase(); });
  await page.getByRole("button", { name: "保留我的修改为副本", exact: true }).click();
  await waitForState(page, value => value.status.pending === 0);
  const all = await (await fetch(`${origin}/api/resumes/`)).json();
  assert.equal(all.resumes.length, 2); assert.ok(all.resumes.some((r: any) => r.resume.title.startsWith("我的冲突版本")));
  assert.equal((await get()).resume.title, "另一端的新版本");

  await page.evaluate(async id => { const { useResumeStore } = await import("/src/store/useResumeStore.ts"); useResumeStore.getState().deleteResume(useResumeStore.getState().resumes[id]); }, resume.id); await flush(page);
  assert.equal((await fetch(`${origin}/api/resumes/${resume.id}`)).status, 404);
  await page.reload(); await ready(page); assert.equal((await state(page)).resumes[resume.id], undefined);
  await page.getByText("简历不存在或已删除", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  assert.deepEqual((await page.context().cookies()).filter(c => ["NEXT_LOCALE", "sidebar:state"].includes(c.name)), []);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === "FileHandleDB")), false);
  assert.deepEqual(errors, []);
  console.log("Verified: transactional legacy backup and old-queue drain, no browser persistence, JSONB editing, reload, clean browser, external API sync, memory retries, exit warning, undo, conflict copy and deletion.");
});
