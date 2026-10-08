import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { applyItemOperation } from "../resume-items";
import type { ResumeData } from "@/types/resume";
import { normalizeResumeDocument, ResumeStorageError, validateMutationId, validateResumeId, validateRevision } from "../resume-storage-contract";
import type { LegacyImportResult, ResumeSnapshot, StoredResume } from "../resume-storage-contract";

type Row = { document: ResumeData; revision: number; deleted_at: Date | null; last_mutation_id: string | null; last_mutation_hash: string | null };
const stored = (row: Row): StoredResume => ({ resume: row.document, revision: row.revision });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const conflict = (row?: Row): never => { throw new ResumeStorageError("revisionConflict", 409, row && !row.deleted_at ? stored(row) : null); };

export class ResumeRepository {
  constructor(private pool: Pool, private source = "web") {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>, action = ""): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('magic_resume.client',$1,true), set_config('magic_resume.action',$2,true)", [this.source, action]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async list(): Promise<ResumeSnapshot> {
    const rows = await this.pool.query("SELECT document, revision FROM resume_documents WHERE deleted_at IS NULL ORDER BY updated_at DESC, id");
    const workspace = await this.pool.query("SELECT storage_id FROM resume_workspace WHERE singleton");
    return { storageId: workspace.rows[0].storage_id, resumes: rows.rows.map(stored) };
  }

  // Polling can check small revision metadata without reading photo/image JSONB.
  async snapshotVersion(): Promise<string> {
    const result = await this.pool.query(`SELECT storage_id,
      (SELECT COALESCE(jsonb_agg(jsonb_build_array(id, revision) ORDER BY id), '[]'::jsonb)
       FROM resume_documents WHERE deleted_at IS NULL) AS versions
      FROM resume_workspace WHERE singleton`);
    return `"${hash(result.rows[0])}"`;
  }

  async get(id: string): Promise<StoredResume> {
    validateResumeId(id);
    const result = await this.pool.query("SELECT document, revision FROM resume_documents WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!result.rowCount) throw new ResumeStorageError("resumeNotFound", 404);
    return stored(result.rows[0]);
  }

  private async write(client: PoolClient, current: Row | undefined, resume: ResumeData, mutation: string, mutationHash: string): Promise<StoredResume> {
      const now = new Date().toISOString();
      const document = { ...resume, createdAt: current?.document.createdAt ?? resume.createdAt, updatedAt: now };
      const result = current
        ? await client.query<Row>("UPDATE resume_documents SET document = $2::jsonb, revision = revision + 1, updated_at = $3, last_mutation_id = $4, last_mutation_hash = $5 WHERE id = $1 RETURNING *", [resume.id, JSON.stringify(document), now, mutation, mutationHash])
        : await client.query<Row>("INSERT INTO resume_documents (id, document, created_at, updated_at, last_mutation_id, last_mutation_hash) VALUES ($1, $2::jsonb, $3, $4, $5, $6) RETURNING *", [resume.id, JSON.stringify(document), document.createdAt, now, mutation, mutationHash]);
      return stored(result.rows[0]);
  }

  async put(value: unknown, expectedRevision: unknown, mutationId: unknown): Promise<StoredResume> {
    const resume = normalizeResumeDocument(value);
    const revision = validateRevision(expectedRevision);
    const mutation = validateMutationId(mutationId);
    const mutationHash = hash(resume);
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [resume.id]);
      const found = await client.query<Row>("SELECT * FROM resume_documents WHERE id = $1 FOR UPDATE", [resume.id]);
      const current = found.rows[0];
      if (current?.last_mutation_id === mutation) {
        if (current.last_mutation_hash !== mutationHash) throw new ResumeStorageError("mutationIdReused", 409);
        return stored(current);
      }
      if (current ? current.deleted_at || current.revision !== revision : revision !== 0) conflict(current);
      return this.write(client, current, resume, mutation, mutationHash);
    });
  }

  async delete(id: string, expectedRevision: unknown, mutationId: unknown): Promise<{ revision: number }> {
    validateResumeId(id);
    const revision = validateRevision(expectedRevision);
    const mutation = validateMutationId(mutationId);
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
      const result = await client.query<Row>("SELECT * FROM resume_documents WHERE id = $1 FOR UPDATE", [id]);
      const current = result.rows[0];
      if (current?.last_mutation_id === mutation && current.last_mutation_hash === "delete") return { revision: current.revision };
      if (!current || current.deleted_at || current.revision !== revision) conflict(current);
      const deleted = await client.query("UPDATE resume_documents SET deleted_at = now(), updated_at = now(), revision = revision + 1, last_mutation_id = $2, last_mutation_hash = 'delete' WHERE id = $1 RETURNING revision", [id, mutation]);
      return deleted.rows[0];
    });
  }

  async editItems(id: string, operation: unknown, expectedRevision: unknown, mutationId: unknown): Promise<StoredResume> {
    validateResumeId(id);
    const revision = validateRevision(expectedRevision), mutation = validateMutationId(mutationId);
    const digest = hash({ itemOperation: operation });
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
      const current = (await client.query<Row>("SELECT * FROM resume_documents WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (current?.last_mutation_id === mutation) {
        if (current.last_mutation_hash !== digest) throw new ResumeStorageError("mutationIdReused", 409);
        return stored(current);
      }
      if (!current || current.deleted_at || current.revision !== revision) conflict(current);
      const resume = applyItemOperation(current.document, operation, randomUUID);
      return this.write(client, current, resume, mutation, digest);
    });
  }

  async history(id: string, limit = 25, before?: number) {
    validateResumeId(id);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new ResumeStorageError("invalidHistoryQuery");
    const current = await this.pool.query("SELECT revision, deleted_at IS NOT NULL AS deleted FROM resume_documents WHERE id=$1", [id]);
    if (!current.rowCount) throw new ResumeStorageError("resumeNotFound", 404);
    const result = await this.pool.query(`SELECT revision,document->>'title' AS title,deleted,action,source,recorded_at AS "recordedAt"
      FROM resume_versions WHERE resume_id=$1 AND ($3::integer IS NULL OR revision<$3) ORDER BY revision DESC LIMIT $2`, [id, limit, before ?? null]);
    return { id, currentRevision: current.rows[0].revision, deleted: current.rows[0].deleted, versions: result.rows,
      nextBefore: result.rows.length === limit ? result.rows.at(-1).revision : null };
  }
  async version(id: string, version: number) {
    validateResumeId(id); validateRevision(version);
    const result = await this.pool.query("SELECT document,revision,deleted,action,source,recorded_at AS \"recordedAt\" FROM resume_versions WHERE resume_id=$1 AND revision=$2", [id, version]);
    if (!result.rowCount) throw new ResumeStorageError("versionNotFound", 404);
    const row = result.rows[0];
    return { ...stored(row), deleted: row.deleted, action: row.action, source: row.source, recordedAt: row.recordedAt };
  }
  async listDeleted() {
    const result = await this.pool.query(`SELECT id, document->>'title' AS title, revision, deleted_at AS "deletedAt"
      FROM resume_documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id LIMIT 100`);
    return { resumes: result.rows };
  }
  async restore(id: string, targetRevision: unknown, expectedRevision: unknown, mutationId: unknown): Promise<StoredResume> {
    validateResumeId(id);
    const target = validateRevision(targetRevision), revision = validateRevision(expectedRevision), mutation = validateMutationId(mutationId);
    const digest = hash({ restoreRevision: target });
    return this.transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
      const current = (await client.query<Row>("SELECT * FROM resume_documents WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (current?.last_mutation_id === mutation) {
        if (current.last_mutation_hash !== digest) throw new ResumeStorageError("mutationIdReused", 409);
        return stored(current);
      }
      if (!current || current.revision !== revision) conflict(current);
      const old = (await client.query("SELECT document FROM resume_versions WHERE resume_id=$1 AND revision=$2", [id, target])).rows[0];
      if (!old) throw new ResumeStorageError("versionNotFound", 404);
      await client.query("UPDATE resume_documents SET deleted_at=NULL WHERE id=$1", [id]);
      return this.write(client, current, normalizeResumeDocument(old.document), mutation, digest);
    }, "restore");
  }

  // A whole legacy batch commits atomically. Stable source fingerprints make
  // retries and a second browser import safe even after later edits/deletes.
  async importLegacy(values: unknown): Promise<LegacyImportResult> {
    if (!Array.isArray(values) || values.length > 500) throw new ResumeStorageError("invalidLegacyImport");
    const documents = values.map(normalizeResumeDocument);
    if (new Set(documents.map(d => d.id)).size !== documents.length) throw new ResumeStorageError("duplicateResumeIds");
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(48260102)");
      const workspace = await client.query("SELECT storage_id FROM resume_workspace WHERE singleton");
      const result: LegacyImportResult = { storageId: workspace.rows[0].storage_id, imported: 0, copied: 0, skipped: 0, idMap: {} };
      for (const source of documents) {
        const sourceHash = hash(source);
        const previous = await client.query("SELECT target_id FROM resume_legacy_imports WHERE source_id = $1 AND source_hash = $2", [source.id, sourceHash]);
        if (previous.rowCount) {
          await client.query("UPDATE resume_legacy_imports SET source_document = $3::jsonb WHERE source_id = $1 AND source_hash = $2 AND source_document IS NULL", [source.id, sourceHash, JSON.stringify(source)]);
          result.idMap[source.id] = previous.rows[0].target_id; result.skipped++; continue;
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [source.id]);
        const existing = await client.query<Row>("SELECT * FROM resume_documents WHERE id = $1 FOR UPDATE", [source.id]);
        const current = existing.rows[0];
        let target = source;
        if (current?.deleted_at || current && hash(current.document) === sourceHash) {
          result.skipped++;
        } else {
          if (current) { target = { ...source, id: randomUUID(), title: `${source.title.slice(0, 500)} (迁移副本)` }; result.copied++; }
          await client.query("INSERT INTO resume_documents (id, document, created_at, updated_at) VALUES ($1, $2::jsonb, $3, $4)", [target.id, JSON.stringify(target), target.createdAt, target.updatedAt]);
          result.imported++;
        }
        result.idMap[source.id] = target.id;
        await client.query("INSERT INTO resume_legacy_imports (source_id, source_hash, target_id, source_document) VALUES ($1, $2, $3, $4::jsonb)", [source.id, sourceHash, target.id, JSON.stringify(source)]);
      }
      return result;
    }, "import");
  }
}
