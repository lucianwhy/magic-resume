import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getDatabase } from "./database";
import { guardResumeRequest, readStorageBody } from "./resume-storage-api";
import { ResumeStorageError, validateMutationId, validateRevision } from "../resume-storage-contract";
import { normalizeWorkspaceValue, workspaceKey, type WorkspaceSnapshot, type WorkspaceKey } from "../workspace-settings-contract";
import type { AISettingsData } from "../../config/ai-models";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export class WorkspaceRepository {
  constructor(private pool: Pool) {}
  async list(): Promise<WorkspaceSnapshot> {
    const result = await this.pool.query("SELECT storage_id, (SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('value', value, 'revision', revision)), '{}'::jsonb) FROM workspace_settings) AS entries FROM resume_workspace");
    return { storageId: result.rows[0].storage_id, entries: result.rows[0].entries };
  }
  async put(keyInput: unknown, valueInput: unknown, revisionInput: unknown, mutationInput: unknown, storageId: unknown) {
    const key = workspaceKey(keyInput), value = normalizeWorkspaceValue(key, valueInput);
    const revision = validateRevision(revisionInput), mutationId = validateMutationId(mutationInput), digest = hash(value);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(48260102)");
      const workspace = (await client.query("SELECT storage_id FROM resume_workspace")).rows[0];
      if (workspace.storage_id !== storageId) throw new ResumeStorageError("databaseChanged", 409);
      const current = (await client.query("SELECT * FROM workspace_settings WHERE key=$1 FOR UPDATE", [key])).rows[0];
      if (current?.last_mutation_id === mutationId && current.last_mutation_hash === digest) { await client.query("COMMIT"); return { value: current.value, revision: current.revision }; }
      if ((current?.revision ?? 0) !== revision || current?.last_mutation_id === mutationId) throw new ResumeStorageError("settingsConflict", 409);
      const result = await client.query(`INSERT INTO workspace_settings (key, value, last_mutation_id, last_mutation_hash) VALUES ($1,$2,$3,$4)
        ON CONFLICT (key) DO UPDATE SET value=excluded.value, revision=workspace_settings.revision+1, updated_at=now(), last_mutation_id=excluded.last_mutation_id, last_mutation_hash=excluded.last_mutation_hash RETURNING value,revision`, [key, JSON.stringify(value), mutationId, digest]);
      await client.query("COMMIT"); return result.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async importLegacy(input: Record<string, unknown>) {
    const values = Object.entries(input).map(([key, value]) => { const k = workspaceKey(key); return [k, normalizeWorkspaceValue(k, value)] as const; });
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(48260102)");
      for (const [key, value] of values) {
        const current = (await client.query("SELECT value FROM workspace_settings WHERE key=$1 FOR UPDATE", [key])).rows[0]?.value;
        let next = value;
        if (key === "ai") {
          const imported = await client.query("INSERT INTO workspace_settings_imports (source_hash, ai_backup) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING source_hash", [hash(value), JSON.stringify(value)]);
          if (!imported.rowCount) continue;
          if (current) {
            const merged = structuredClone(current) as AISettingsData;
            const idMap = new Map<string, string>();
            for (const model of (value as AISettingsData).models) {
              const equivalent = merged.models.find(m => ["provider", "protocol", "apiKey", "model", "baseUrl"].every(field => (m as any)[field] === (model as any)[field]));
              if (equivalent) { idMap.set(model.id, equivalent.id); continue; }
              const id = merged.models.some(m => m.id === model.id) ? `imported-${randomUUID()}` : model.id;
              idMap.set(model.id, id); merged.models.push({ ...model, id });
            }
            const legacy = value as AISettingsData;
            merged.textModelId ??= legacy.textModelId ? idMap.get(legacy.textModelId) ?? null : null;
            merged.pdfModelId ??= legacy.pdfModelId ? idMap.get(legacy.pdfModelId) ?? null : null;
            next = normalizeWorkspaceValue("ai", merged);
          }
        } else if (current) next = { ...value, ...current };
        if (current && hash(next) === hash(current)) continue;
        await client.query(`INSERT INTO workspace_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=excluded.value,revision=workspace_settings.revision+1,updated_at=now(),last_mutation_id=NULL,last_mutation_hash=NULL`, [key, JSON.stringify(next)]);
      }
      await client.query("COMMIT"); return await this.list();
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}
export async function handleWorkspaceSettings(request: Request, key?: WorkspaceKey, repository?: WorkspaceRepository) {
  try {
    guardResumeRequest(request); const repo = repository ?? new WorkspaceRepository(getDatabase());
    if (request.method === "GET" && !key) return json(await repo.list());
    const input = await readStorageBody(request);
    if (JSON.stringify(input).length > 1024 * 1024) throw new ResumeStorageError("settingsTooLarge", 413);
    if (request.method === "POST" && !key) return json(await repo.importLegacy(input));
    if (request.method === "PUT" && key) return json(await repo.put(key, input.value, input.expectedRevision, input.mutationId, input.storageId));
    return json({ code: "methodNotAllowed" }, 405);
  } catch (error) {
    if (error instanceof ResumeStorageError) return json({ code: error.code }, error.status);
    console.error("[workspace-settings] Database request failed"); return json({ code: "databaseUnavailable" }, 503);
  }
}
