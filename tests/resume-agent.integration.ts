import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
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
  const tools = await mcp.listTools(); assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ["create_resume", "delete_resume", "get_resume", "list_resumes", "update_resume"]);
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
  assert.deepEqual(errors, []);
  console.log("Verified actual stdio initialize/tools/resources, CLI stdin/export/import, two-way browser synchronization, secret-preserving patches, conflicts and deletion.");
});
