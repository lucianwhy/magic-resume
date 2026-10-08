import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { createServer as createHTTPServer } from "node:http";
import pg from "pg";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { migrateResumeDatabase } from "../src/lib/server/resume-migrations";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const artifacts = resolve(".local/agent-tests");
const cliScript = resolve("scripts/resume-cli.mjs"); const mcpScript = resolve("scripts/resume-mcp.mjs");
const cwd = resolve(artifacts, "outside-project");
async function port() {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const value = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve())); return value;
}
function cli(origin: string, args: string[], input = "") {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliScript, ...args], { cwd, env: { ...process.env, MAGIC_RESUME_API_URL: origin }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = ""; child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
}
test("CLI, real stdio MCP and browser share the same database, revisions and conflict handling", { timeout: 180000 }, async t => {
  assert.ok(process.env.DATABASE_URL, "Run pnpm db:start first"); await mkdir(cwd, { recursive: true });
  const name = `magic_resume_agent_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL }); await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!); url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString() }); await migrateResumeDatabase(pool);
  const origin = `http://127.0.0.1:${await port()}`;
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", new URL(origin).port, "--strictPort"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; server.stdout.on("data", chunk => log += chunk); server.stderr.on("data", chunk => log += chunk);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined; let mcp: Client | undefined;
  t.after(async () => {
    await mcp?.close(); await browser?.close(); server.kill("SIGTERM");
    await new Promise<void>(resolve => server.exitCode !== null ? resolve() : server.once("exit", () => resolve()));
    await pool.end(); await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); await admin.end();
    await writeFile(resolve(artifacts, "server.log"), log);
  });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${origin}/api/resumes/`)).ok) break; } catch {}
    if (i === 119) throw new Error("Test web server did not start");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  mcp = new Client({ name: "magic-resume-integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [mcpScript], cwd, env: { MAGIC_RESUME_API_URL: origin }, stderr: "pipe" });
  await mcp.connect(transport);
  const tools = await mcp.listTools(); assert.equal(tools.tools.length, 18);
  for (const name of ["create_resume", "delete_resume", "get_resume", "list_resumes", "update_resume", "edit_resume_item", "list_resume_history", "restore_resume_version", "save_ai_model", "test_ai_model"]) assert.ok(tools.tools.some(tool => tool.name === name));
  assert.equal((await mcp.readResource({ uri: "magic-resume://guide" })).contents.length, 1);
  const created = await cli(origin, ["create", "--title", "CLI 与 MCP 验收", "--file", "-"], JSON.stringify({
    basic: { name: "初始姓名", photo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFbkAAAAASUVORK5CYII=", githubKey: "test-secret" },
    skillContent: "<p>CLI 初始正文</p>", activeSection: "skills",
    menuSections: [{ id: "basic", title: "基本信息", icon: "👤", order: 0, enabled: true }, { id: "skills", title: "技能", icon: "🛠️", order: 1, enabled: true }],
  }));
  assert.equal(created.code, 0, created.stderr); const first = JSON.parse(created.stdout); const id = first.resume.id;
  const get = async () => (await (await fetch(`${origin}/api/resumes/${id}`)).json());
  const listed = await cli(origin, ["list"]); assert.equal(JSON.parse(listed.stdout).resumes[0].id, id); assert.ok(!listed.stdout.includes("test-secret"));
  const cliRead = await cli(origin, ["get", id, "--section", "basic,skillContent"]);
  assert.equal(cliRead.code, 0, cliRead.stderr);
  assert.equal(JSON.parse(cliRead.stdout).resume.basic.name, "初始姓名");
  assert.ok(!cliRead.stdout.includes("test-secret") && !cliRead.stdout.includes("data:image/png"));
  const read = await mcp.callTool({ name: "get_resume", arguments: { id, sections: ["basic", "skillContent"] } });
  assert.equal(read.isError, undefined); assert.ok(!JSON.stringify(read).includes("test-secret"));
  assert.equal((read.structuredContent as any).revision, first.revision);
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/app/workbench/${id}`); await page.getByTestId("resume-storage-status").waitFor();
  const editor = page.locator('.tiptap[contenteditable="true"]:visible').first(); await editor.waitFor();
  assert.match(await editor.innerText(), /CLI 初始正文/);
  const updated = await mcp.callTool({ name: "update_resume", arguments: { id, expectedRevision: first.revision, patch: { skillContent: "<p>MCP 更新后的中文正文</p>", basic: { title: "AI 工程师" } } } });
  assert.equal(updated.isError, undefined, JSON.stringify(updated));
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.tiptap[contenteditable="true"]')).some(element => element.textContent?.includes("MCP 更新后的中文正文")));
  const fromMCP = await get(); assert.equal(fromMCP.resume.basic.githubKey, "test-secret"); assert.ok(fromMCP.resume.basic.photo.startsWith("data:image/png"));
  await editor.fill("网页编辑后的正文");
  for (let i = 0; i < 100; i++) { if ((await get()).resume.skillContent.includes("网页编辑后的正文")) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  const fromBrowser = await get(); assert.match(fromBrowser.resume.skillContent, /网页编辑后的正文/);
  const conflict = await cli(origin, ["patch", id, "--revision", String(fromMCP.revision), "--file", "-"], '{"basic":{"name":"stale"}}');
  assert.equal(conflict.code, 2); assert.equal(JSON.parse(conflict.stderr).code, "revisionConflict"); assert.ok(!conflict.stderr.includes("test-secret"));
  const mcpConflict = await mcp.callTool({ name: "update_resume", arguments: { id, expectedRevision: fromMCP.revision, patch: { basic: { name: "stale" } } } });
  assert.equal(mcpConflict.isError, true); assert.equal((mcpConflict.structuredContent as any).code, "revisionConflict");
  const patch = await cli(origin, ["patch", id, "--revision", String(fromBrowser.revision), "--file", "-"], '{"basic":{"name":"CLI 更新姓名"}}');
  assert.equal(patch.code, 0, patch.stderr);
  await page.waitForFunction(() => document.querySelector("#resume-preview")?.textContent?.includes("CLI 更新姓名"));
  await page.screenshot({ path: resolve(artifacts, "cli-mcp-browser.png"), fullPage: true });
  const exported = resolve(artifacts, `${id}.json`);
  assert.equal((await cli(origin, ["export", id, "--output", exported])).code, 0);
  const backup = JSON.parse(await readFile(exported, "utf8")); assert.equal(backup.basic.githubKey, "test-secret");
  assert.equal((await cli(origin, ["export", id, "--output", exported])).code, 1);
  const imported = await cli(origin, ["import", "--file", exported]); assert.equal(imported.code, 0, imported.stderr); assert.equal(JSON.parse(imported.stdout).imported, 0);
  const deleted = await mcp.callTool({ name: "delete_resume", arguments: { id, expectedRevision: (await get()).revision } }); assert.equal(deleted.isError, undefined);
  await page.getByText("简历不存在或已删除", { exact: true }).waitFor();
  const missing = await mcp.callTool({ name: "get_resume", arguments: { id } }); assert.equal(missing.isError, true);
  const afterDelete = await cli(origin, ["import", "--file", exported]); assert.equal(JSON.parse(afterDelete.stdout).imported, 0);
  const secondCreate = await mcp.callTool({ name: "create_resume", arguments: { title: "MCP 新建", locale: "en" } }); assert.equal(secondCreate.isError, undefined);
  const secondRecord = secondCreate.structuredContent as any;
  assert.equal((await cli(origin, ["delete", secondRecord.resume.id, "--revision", String(secondRecord.revision)])).code, 0);
  // Restore the deleted synthetic resume, then edit one item through both entry points.
  const oldHistory = await mcp.callTool({ name: "list_resume_history", arguments: { id } });
  const history = oldHistory.structuredContent as any;
  assert.equal(history.deleted, true);
  const restore = await mcp.callTool({ name: "restore_resume_version", arguments: { id, targetRevision: 1, expectedRevision: history.currentRevision } });
  assert.equal(restore.isError, undefined, JSON.stringify(restore));
  const restored = await get(); assert.equal(restored.resume.basic.githubKey, "test-secret");
  const itemMutation = randomUUID();
  const operation = { section: "experience", action: "add", item: { company: "条目测试公司", position: "实习生", date: "2026", details: "<p>保持正文</p>" } };
  const addedCLI = await cli(origin, ["item", id, "--revision", String(restored.revision), "--file", "-", "--mutation-id", itemMutation], JSON.stringify(operation));
  assert.equal(addedCLI.code, 0, addedCLI.stderr); const added = JSON.parse(addedCLI.stdout);
  const retried = await cli(origin, ["item", id, "--revision", String(restored.revision), "--file", "-", "--mutation-id", itemMutation], JSON.stringify(operation));
  assert.equal(retried.code, 0, retried.stderr); assert.equal(JSON.parse(retried.stdout).revision, added.revision);
  const itemId = added.resume.experience[0].id;
  const itemUpdate = await mcp.callTool({ name: "edit_resume_item", arguments: { id, expectedRevision: added.revision, operation: { section: "experience", action: "update", itemId, item: { company: "科大讯飞" } } } });
  assert.equal(itemUpdate.isError, undefined, JSON.stringify(itemUpdate));
  const withItem = await get(); assert.equal(withItem.resume.experience[0].company, "科大讯飞");
  assert.equal(withItem.resume.experience[0].details, "<p>保持正文</p>");
  await page.waitForFunction(async id => (await import("/src/store/useResumeStore.ts" as string)).useResumeStore.getState().resumes[id]?.experience[0]?.company === "科大讯飞", id);
  const historyCLI = await cli(origin, ["history", id, "--limit", "2"]); assert.equal(historyCLI.code, 0, historyCLI.stderr);
  const latestHistory = JSON.parse(historyCLI.stdout); assert.equal(latestHistory.versions[0].source, "mcp"); assert.equal(latestHistory.versions[1].source, "cli");
  const version = await mcp.callTool({ name: "get_resume_version", arguments: { id, version: 1 } });
  assert.ok(!JSON.stringify(version).includes("test-secret"));
  const diff = await cli(origin, ["diff", id, "--from", "1", "--to", String(withItem.revision)]);
  assert.equal(diff.code, 0, diff.stderr); assert.ok(JSON.parse(diff.stdout).changedFields.includes("experience"));
  const restoredCLI = await cli(origin, ["restore", id, "--version", "1", "--revision", String(withItem.revision)]);
  assert.equal(restoredCLI.code, 0, restoredCLI.stderr);
  assert.equal((await get()).resume.experience.length, 0);
  assert.equal((await get()).resume.basic.githubKey, "test-secret");
  await cli(origin, ["delete", id, "--revision", String(JSON.parse(restoredCLI.stdout).revision)]);
  const deletedList = await mcp.callTool({ name: "list_deleted_resumes", arguments: {} });
  assert.ok((deletedList.structuredContent as any).resumes.some((r: any) => r.id === id));

  // A local synthetic provider proves stored credentials are used without any external calls.
  let providerRequests = 0;
  const provider = createHTTPServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer synthetic-provider-key"); providerRequests++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url?.endsWith("/models") ? { data: [{ id: "synthetic-catalogue-model" }] } : { choices: [{ message: { content: "OK" } }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => provider.close(() => resolve())));
  const providerURL = `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1`;
  const aiRead = await cli(origin, ["ai", "list"]); assert.equal(aiRead.code, 0, aiRead.stderr); const initialAI = JSON.parse(aiRead.stdout);
  const aiSave = await cli(origin, ["ai", "save", "--revision", String(initialAI.revision), "--storage-id", initialAI.storageId, "--file", "-"], JSON.stringify({ id: "synthetic-profile", provider: "qwen", model: "qwen3-vl-plus", baseUrl: providerURL, apiKey: "synthetic-provider-key" }));
  assert.equal(aiSave.code, 0, aiSave.stderr); assert.ok(!aiSave.stdout.includes("synthetic-provider-key"));
  const aiConfig = JSON.parse(aiSave.stdout); assert.equal(aiConfig.models[0].hasApiKey, true);
  const aiUpdate = await mcp.callTool({ name: "save_ai_model", arguments: { profile: { id: "synthetic-profile", name: "修改名称并保留 Key" }, expectedRevision: aiConfig.revision, storageId: initialAI.storageId } });
  assert.equal(aiUpdate.isError, undefined, JSON.stringify(aiUpdate)); assert.ok(!JSON.stringify(aiUpdate).includes("synthetic-provider-key"));
  const assign = await cli(origin, ["ai", "assign", "--task", "pdf", "--model-id", "synthetic-profile", "--revision", String((aiUpdate.structuredContent as any).revision), "--storage-id", initialAI.storageId]);
  assert.equal(assign.code, 0, assign.stderr);
  const modelTest = await mcp.callTool({ name: "test_ai_model", arguments: { modelId: "synthetic-profile" } });
  assert.equal(modelTest.isError, undefined, JSON.stringify(modelTest)); assert.equal((modelTest.structuredContent as any).ok, true);
  const discover = await cli(origin, ["ai", "discover", "--model-id", "synthetic-profile"]);
  assert.equal(discover.code, 0, discover.stderr); assert.equal(JSON.parse(discover.stdout).models[0].id, "synthetic-catalogue-model");
  assert.equal(providerRequests, 2);
  await page.waitForFunction(async () => (await import("/src/store/useAIConfigStore.ts" as string)).useAIConfigStore.getState().models.some((m: any) => m.id === "synthetic-profile"));
  const aiConflict = await cli(origin, ["ai", "delete", "--model-id", "synthetic-profile", "--revision", String(aiConfig.revision), "--storage-id", initialAI.storageId]);
  assert.equal(aiConflict.code, 2); assert.ok(!aiConflict.stderr.includes("synthetic-provider-key"));
  const aiRemoved = await mcp.callTool({ name: "delete_ai_model", arguments: { modelId: "synthetic-profile", expectedRevision: JSON.parse(assign.stdout).revision, storageId: initialAI.storageId } });
  assert.equal(aiRemoved.isError, undefined, JSON.stringify(aiRemoved));
  const afterAI = await mcp.callTool({ name: "list_ai_models", arguments: {} }); assert.equal((afterAI.structuredContent as any).models.length, 0);
  const providers = await mcp.callTool({ name: "list_ai_providers", arguments: {} }); assert.ok((providers.structuredContent as any).providers.qwen);
  assert.deepEqual(errors, []);
  console.log("Verified actual stdio initialize/tools/resources, CLI stdin/export/import, two-way browser synchronization, precise items, history/diffs/restore, AI configuration and stored-key provider calls, conflicts and deletion.");
});
