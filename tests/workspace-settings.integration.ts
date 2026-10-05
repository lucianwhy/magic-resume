import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import pg from "pg";
import { chromium, type Page } from "playwright";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";
import { createModelProfile } from "../src/config/ai-models";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const artifacts = resolve(".local/workspace-tests");
const ready = async (page: Page) => { await page.getByTestId("resume-storage-status").waitFor(); };
const settings = (page: Page) => page.evaluate(async () => {
  const module = await import("/src/lib/workspace-settings-client.ts" as string);
  return module.useWorkspaceSettings.getState();
});
const settle = (page: Page) => page.evaluate(async () => {
  const module = await import("/src/lib/workspace-settings-client.ts" as string);
  await module.flushWorkspaceSettings();
});
test("browser migrates AI keys and preferences; fresh browsers read PostgreSQL; writes serialize and conflicts stop", { timeout: 180000 }, async t => {
  assert.ok(process.env.DATABASE_URL); await mkdir(artifacts, { recursive: true });
  const name = `magic_resume_workspace_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL }); await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString() }); await migrateResumeDatabase(pool);
  const socket = createServer(); await new Promise<void>(r => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as { port: number }).port; await new Promise<void>(r => socket.close(() => r()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; server.stdout.on("data", c => log += c); server.stderr.on("data", c => log += c);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  t.after(async () => {
    await browser?.close(); server.kill("SIGTERM");
    await new Promise<void>(r => server.exitCode !== null ? r() : server.once("exit", () => r()));
    await pool.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end();
    await writeFile(resolve(artifacts, "server.log"), log);
  });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${origin}/api/workspace/`)).ok) break; } catch {}
    if (i === 119) throw new Error("Test server did not start"); await new Promise(r => setTimeout(r, 250));
  }
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => void d.accept());
  await page.goto(`${origin}/zh`);
  const legacy = { models: [{ ...createModelProfile("qwen", "legacy-qwen"), apiKey: "synthetic-old-key", model: "qwen3-vl-plus" }], textModelId: "legacy-qwen", pdfModelId: "legacy-qwen" };
  await page.evaluate(async value => {
    localStorage.setItem("ai-config-storage", JSON.stringify({ state: value, version: 1 }));
    localStorage.setItem("magic-resume-theme", "dark");
    document.cookie = "NEXT_LOCALE=zh; path=/";
    document.cookie = "sidebar:state=false; path=/";
    const root = await navigator.storage.getDirectory();
    const handle = await root.getDirectoryHandle("legacy-backup", { create: true });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("FileHandleDB", 2);
      request.onupgradeneeded = () => { request.result.createObjectStore("handles"); request.result.createObjectStore("config"); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(["handles", "config"], "readwrite");
        tx.objectStore("handles").put(handle, "syncDirectory");
        tx.objectStore("config").put("legacy-backup", "syncDirectoryPath");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }, legacy);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error("Browser persistence is forbidden in this test"); };
  });
  await page.goto(`${origin}/app/dashboard/ai`); await ready(page);
  assert.equal((await settings(page)).snapshot.entries.ai.value.models[0].apiKey, "synthetic-old-key");
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.deepEqual((await page.context().cookies()).filter(c => ["NEXT_LOCALE", "sidebar:state"].includes(c.name)), []);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === "FileHandleDB")), false);
  assert.equal((await settings(page)).snapshot.entries.preferences.value.sidebarOpen, false);
  assert.equal((await pool.query("SELECT value FROM workspace_settings WHERE key='file-sync'")).rows[0].value.directoryName, "legacy-backup");
  assert.equal(await page.evaluate(async () => !!(await (await import("/src/utils/fileSystem.ts" as string)).getFileHandle("syncDirectory"))), true);
  assert.equal((await pool.query("SELECT value FROM workspace_settings WHERE key='ai'")).rows[0].value.models[0].apiKey, "synthetic-old-key");
  // Saving through the same store used by real form controls updates PostgreSQL.
  await page.evaluate(async () => {
    const { useAIConfigStore } = await import("/src/store/useAIConfigStore.ts" as string);
    const profile = useAIConfigStore.getState().models[0];
    useAIConfigStore.getState().saveModel({ ...profile, apiKey: "synthetic-updated-key" });
  }); await settle(page);
  await page.reload(); await ready(page);
  assert.equal((await settings(page)).snapshot.entries.ai.value.models[0].apiKey, "synthetic-updated-key");
  assert.equal(await page.evaluate(async () => (await (await import("/src/utils/fileSystem.ts" as string)).getFileHandle("syncDirectory"))), null, "grants are memory only and must be reselected after refresh");
  const fresh = await browser.newContext();
  await fresh.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error("Browser persistence is forbidden in this test"); };
    indexedDB.open = () => { throw new Error("Fresh browsers must not create IndexedDB databases"); };
  });
  const second = await fresh.newPage();
  await second.goto(`${origin}/app/dashboard/settings`); await ready(second);
  assert.equal(await second.evaluate(() => localStorage.getItem("ai-config-storage")), null);
  assert.equal((await settings(second)).snapshot.entries.ai.value.models[0].apiKey, "synthetic-updated-key");
  // Exercise the real theme control, including cross-browser propagation.
  await second.locator("label").filter({ has: second.getByRole("radio", { name: "浅色", exact: true }) }).click(); await settle(second);
  assert.equal(await second.getByRole("radio", { name: "浅色", exact: true }).isChecked(), true);
  assert.equal((await pool.query("SELECT value FROM workspace_settings WHERE key='preferences'")).rows[0].value.theme, "light");
  await page.waitForFunction(() => document.documentElement.classList.contains("light"));
  // Delayed saves followed by rapid edits must preserve the final edit.
  let delayed = false;
  await second.route("**/api/workspace/preferences", async route => {
    if (!delayed) { delayed = true; await new Promise(r => setTimeout(r, 250)); }
    await route.continue();
  });
  await second.evaluate(async () => {
    const { savePreference } = await import("/src/lib/workspace-settings-client.ts" as string);
    savePreference("theme", "dark"); savePreference("theme", "light"); savePreference("theme", "system");
  }); await settle(second);
  assert.equal((await pool.query("SELECT value FROM workspace_settings WHERE key='preferences'")).rows[0].value.theme, "system");
  await second.unroute("**/api/workspace/preferences");
  // Lose the acknowledgement after PostgreSQL commits; retry the exact write.
  let lost = false;
  await second.route("**/api/workspace/ai", async route => {
    if (!lost) { lost = true; await route.fetch(); await route.abort(); } else await route.continue();
  });
  await second.evaluate(async () => {
    const { useAIConfigStore } = await import("/src/store/useAIConfigStore.ts" as string);
    useAIConfigStore.getState().saveModel({ ...useAIConfigStore.getState().models[0], apiKey: "synthetic-lost-ack" });
  }); await settle(second);
  const committedRevision = (await pool.query("SELECT revision FROM workspace_settings WHERE key='ai'")).rows[0].revision;
  assert.equal((await settings(second)).pending, 1); await settle(second);
  assert.equal((await settings(second)).pending, 0);
  assert.equal((await pool.query("SELECT revision FROM workspace_settings WHERE key='ai'")).rows[0].revision, committedRevision);
  await second.unroute("**/api/workspace/ai");
  // Keep this browser's version stale, modify elsewhere, then reject its write.
  await second.route("**/api/workspace/", route => route.abort());
  await pool.query("UPDATE workspace_settings SET value=jsonb_set(value,'{models,0,apiKey}','\"synthetic-other-writer\"'), revision=revision+1 WHERE key='ai'");
  await second.evaluate(async () => {
    const { useAIConfigStore } = await import("/src/store/useAIConfigStore.ts" as string);
    useAIConfigStore.getState().saveModel({ ...useAIConfigStore.getState().models[0], apiKey: "synthetic-stale-writer" });
  }); await settle(second);
  assert.equal((await settings(second)).error, "settingsConflict");
  assert.equal((await pool.query("SELECT value FROM workspace_settings WHERE key='ai'")).rows[0].value.models[0].apiKey, "synthetic-other-writer");
  await second.getByTestId("workspace-settings-status").waitFor();
  await second.screenshot({ path: resolve(artifacts, "settings-conflict.png"), fullPage: true });
  await second.unroute("**/api/workspace/");
  await second.getByRole("button", { name: "采用数据库版本", exact: true }).click();
  await second.waitForFunction(async () => (await import("/src/lib/workspace-settings-client.ts" as string)).useWorkspaceSettings.getState().pending === 0);
  assert.equal((await settings(second)).snapshot.entries.ai.value.models[0].apiKey, "synthetic-other-writer");
  // Directory metadata is global, but a clean browser still needs its own grant.
  await second.evaluate(async () => {
    const { saveWorkspaceValue, flushWorkspaceSettings } = await import("/src/lib/workspace-settings-client.ts" as string);
    saveWorkspaceValue("file-sync", { directoryName: "synthetic-backup", configured: true, mode: "readwrite" }); await flushWorkspaceSettings();
  }); await second.reload(); await ready(second);
  await second.getByText("synthetic-backup · 请在当前浏览器重新选择授权", { exact: true }).waitFor();
  assert.equal(await second.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual((await fresh.cookies()).filter(c => ["NEXT_LOCALE", "sidebar:state"].includes(c.name)), []);
  assert.equal(await second.evaluate(async () => (await indexedDB.databases()).some(db => db.name === "FileHandleDB")), false);
  assert.deepEqual(errors, []);
  console.log("Verified legacy AI migration, no browser key copies, fresh-browser readback, real theme controls, serialized changes, lost acknowledgements, conflicts, and directory reauthorization.");
});
