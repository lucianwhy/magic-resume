import { parseArgs } from "node:util";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ResumeAgentClient, AgentError, SECTIONS, projectResume, errorDetails, type Section } from "./resume-client";
import { normalizeResumeDocument } from "../lib/resume-storage-contract";

const HELP = `Magic Resume CLI — JSON output; local API defaults to http://127.0.0.1:3000

  list
  get ID [--section basic,skillContent] [--include-images]
  create --title TITLE [--locale zh|en] [--id ID] [--file PATCH.json|-]
  patch ID --revision N --file PATCH.json|- [--mutation-id UUID]
  delete ID --revision N [--mutation-id UUID]
  export ID --output resume.json|- [--force]
  import --file resume.json|-
  item ID --revision N --file operation.json|- [--mutation-id UUID]
  history ID [--limit 25] [--before N]
  version ID --version N [--include-images]
  diff ID --from N --to N
  restore ID --version N --revision N [--mutation-id UUID]
  deleted
  ai list | ai providers
  ai save --revision N --storage-id UUID --file profile.json|- [--mutation-id UUID]
  ai delete --model-id ID --revision N --storage-id UUID [--mutation-id UUID]
  ai assign --task text|pdf --model-id ID|none --revision N --storage-id UUID [--mutation-id UUID]
  ai test --model-id ID [--kind text|pdf]
  ai discover --model-id ID

AI lists/writes omit API keys. Omit apiKey when updating to preserve it.
AI --revision can be 0 on first save. Use ai list for revision/storageId.

All commands: --url http://127.0.0.1:PORT (or MAGIC_RESUME_API_URL).
Patches use JSON Merge Patch: objects merge, arrays replace, null removes a field.
Get the current revision before editing. Conflicts exit 2; other failures exit 1.
Export includes images and secrets for backup. Existing files need --force.
Start the database and web server first: pnpm db:start; pnpm db:migrate; pnpm dev
`;
const optionNames: Record<string, string[]> = {
  item: ["revision", "file", "mutation-id"], history: ["limit", "before"], version: ["version", "include-images"], diff: ["from", "to"], restore: ["version", "revision", "mutation-id"], deleted: [],
  "ai-list": [], "ai-providers": [], "ai-save": ["revision", "storage-id", "file", "mutation-id"],
  "ai-delete": ["model-id", "revision", "storage-id", "mutation-id"], "ai-assign": ["task", "model-id", "revision", "storage-id", "mutation-id"],
  "ai-test": ["model-id", "kind"], "ai-discover": ["model-id"],
  list: [], get: ["section", "include-images"], create: ["title", "locale", "id", "file", "mutation-id"],
  patch: ["revision", "file", "mutation-id"], delete: ["revision", "mutation-id"], export: ["output", "force"], import: ["file"],
};
const MAX_BYTES = 32 * 1024 * 1024;
async function readJSON(path: string) {
  let bytes: Buffer;
  if (path === "-") {
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of process.stdin) {
      const buffer = Buffer.from(chunk); length += buffer.length;
      if (length > MAX_BYTES) throw new AgentError("inputTooLarge", "Input exceeds 32 MiB.");
      chunks.push(buffer);
    }
    bytes = Buffer.concat(chunks);
  } else {
    if ((await stat(path)).size > MAX_BYTES) throw new AgentError("inputTooLarge", "Input exceeds 32 MiB.");
    bytes = await readFile(path);
  }
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new AgentError("invalidJSON", "Input must contain valid JSON."); }
}
function required(value: string | undefined, name: string): string {
  if (value === undefined || value === "") throw new AgentError("usage", `Missing ${name}. Run --help.`);
  return value;
}
function revision(value?: string, allowZero = false): number {
  if (!value || !(allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/).test(value) || !Number.isSafeInteger(Number(value))) throw new AgentError("usage", "--revision must be a positive integer from get/list.");
  return Number(value);
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    version: { type: "string" }, limit: { type: "string" }, before: { type: "string" }, from: { type: "string" }, to: { type: "string" },
    "model-id": { type: "string" }, "storage-id": { type: "string" }, task: { type: "string" }, kind: { type: "string" },
    help: { type: "boolean", short: "h" }, url: { type: "string" }, title: { type: "string" }, locale: { type: "string" },
    id: { type: "string" }, file: { type: "string" }, revision: { type: "string" }, "mutation-id": { type: "string" },
    section: { type: "string" }, "include-images": { type: "boolean" }, output: { type: "string" }, force: { type: "boolean" },
  } });
  if (values.help || !positionals.length) { process.stdout.write(HELP); return; }
  if (positionals[0] === "ai") positionals.splice(0, 2, `ai-${positionals[1] ?? ""}`);
  const [command, id] = positionals;
  if (!Object.hasOwn(optionNames, command)) throw new AgentError("usage", `Unknown command: ${command}. Run --help.`);
  const needsID = ["get", "patch", "delete", "export", "item", "history", "version", "diff", "restore"].includes(command);
  if (positionals.length !== (needsID ? 2 : 1)) throw new AgentError("usage", `Invalid arguments for ${command}. Run --help.`);
  for (const key of Object.keys(values)) if (!["help", "url", ...optionNames[command]].includes(key)) throw new AgentError("usage", `--${key} is not valid for ${command}.`);
  const client = new ResumeAgentClient(values.url);
  let result: unknown;
  switch (command) {
    case "item": result = await client.editItem(id, revision(values.revision), await readJSON(required(values.file, "--file")), values["mutation-id"]); break;
    case "history": result = await client.history(id, values.limit ? revision(values.limit) : 25, values.before ? revision(values.before) : undefined); break;
    case "version": result = await client.version(id, revision(values.version), values["include-images"]); break;
    case "diff": result = await client.diff(id, revision(values.from), revision(values.to)); break;
    case "restore": result = await client.restore(id, revision(values.version), revision(values.revision), values["mutation-id"]); break;
    case "deleted": result = await client.deleted(); break;
    case "ai-list": result = await client.aiList(); break;
    case "ai-providers": result = await client.aiProviders(); break;
    case "ai-save": result = await client.aiChange({ action: "upsert", profile: await readJSON(required(values.file, "--file")) }, revision(values.revision, true), required(values["storage-id"], "--storage-id"), values["mutation-id"]); break;
    case "ai-delete": result = await client.aiChange({ action: "delete", modelId: required(values["model-id"], "--model-id") }, revision(values.revision, true), required(values["storage-id"], "--storage-id"), values["mutation-id"]); break;
    case "ai-assign": {
      if (!values.task || !["text", "pdf"].includes(values.task)) throw new AgentError("usage", "--task must be text or pdf.");
      const modelId = required(values["model-id"], "--model-id");
      result = await client.aiChange({ action: "assign", task: values.task, modelId: modelId === "none" ? null : modelId }, revision(values.revision, true), required(values["storage-id"], "--storage-id"), values["mutation-id"]); break;
    }
    case "ai-test": {
      if (values.kind && !["text", "pdf"].includes(values.kind)) throw new AgentError("usage", "--kind must be text or pdf.");
      result = await client.aiTest(required(values["model-id"], "--model-id"), values.kind as "text" | "pdf" | undefined); break;
    }
    case "ai-discover": result = await client.aiDiscover(required(values["model-id"], "--model-id")); break;
    case "list": result = await client.list(); break;
    case "get": {
      const sections = values.section?.split(",") as Section[] | undefined;
      if (sections?.some(section => !SECTIONS.includes(section))) throw new AgentError("usage", `Unknown section. Choose: ${SECTIONS.join(", ")}.`);
      result = projectResume(await client.get(id), { sections, includeImages: values["include-images"] }); break;
    }
    case "create": {
      if (values.locale && !["zh", "en"].includes(values.locale)) throw new AgentError("usage", "--locale must be zh or en.");
      result = await client.create({ title: required(values.title, "--title"), locale: values.locale as "zh" | "en" | undefined, id: values.id, mutationId: values["mutation-id"], patch: values.file ? await readJSON(values.file) : undefined }); break;
    }
    case "patch": result = await client.update(id, revision(values.revision), await readJSON(required(values.file, "--file")), values["mutation-id"]); break;
    case "delete": result = await client.delete(id, revision(values.revision), values["mutation-id"]); break;
    case "export": {
      const path = required(values.output, "--output"); const saved = await client.get(id);
      if (path === "-") result = saved.resume;
      else {
        await writeFile(path, JSON.stringify(saved.resume, null, 2) + "\n", { flag: values.force ? "w" : "wx", mode: 0o600 });
        await chmod(path, 0o600);
        result = { id, revision: saved.revision, path: resolve(path) };
      }
      break;
    }
    case "import": {
      const input = await readJSON(required(values.file, "--file"));
      const resumes = (Array.isArray(input) ? input : [input?.resume ?? input]).map(normalizeResumeDocument);
      const response = await fetch(`${client.origin}/api/resumes/`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumes }) });
      const data = await response.json();
      if (!response.ok) throw new AgentError(data.code ?? "importFailed", `Import failed: HTTP ${response.status}.`, response.status);
      result = data; break;
    }
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
try { await main(); }
catch (error) {
  const details = error instanceof Error && (error as NodeJS.ErrnoException).code === "EEXIST" ? { code: "fileExists", message: "Export file exists; choose another path or use --force.", status: 400 } : errorDetails(error);
  process.stderr.write(JSON.stringify(details, null, 2) + "\n"); process.exitCode = details.status === 409 ? 2 : 1;
}
