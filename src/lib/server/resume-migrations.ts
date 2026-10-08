import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

const migrations = [{
  version: "001-resume-documents",
  sql: `
    CREATE TABLE resume_workspace (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      storage_id uuid NOT NULL UNIQUE
    );
    CREATE TABLE resume_documents (
      id text PRIMARY KEY,
      document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object' AND document->>'id' = id),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL,
      deleted_at timestamptz,
      last_mutation_id text,
      last_mutation_hash text
    );
    CREATE INDEX resume_documents_updated ON resume_documents(updated_at DESC) WHERE deleted_at IS NULL;
    CREATE TABLE resume_legacy_imports (
      source_id text NOT NULL,
      source_hash text NOT NULL,
      target_id text NOT NULL REFERENCES resume_documents(id),
      imported_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (source_id, source_hash)
    );
  `,
}, {
  version: "002-workspace-settings",
  sql: `
    CREATE TABLE workspace_settings (
      key text PRIMARY KEY CHECK (key IN ('ai', 'preferences', 'file-sync')),
      value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_mutation_id text,
      last_mutation_hash text
    );
    CREATE TABLE workspace_settings_imports (
      source_hash text PRIMARY KEY,
      ai_backup jsonb NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now()
    );
  `,
}, {
  version: "003-legacy-resume-backup",
  sql: `ALTER TABLE resume_legacy_imports ADD COLUMN source_document jsonb CHECK (source_document IS NULL OR jsonb_typeof(source_document) = 'object');`,
}, {
  version: "004-resume-history",
  sql: `
    CREATE TABLE resume_versions (
      resume_id text NOT NULL REFERENCES resume_documents(id),
      revision integer NOT NULL CHECK (revision > 0),
      document jsonb NOT NULL,
      deleted boolean NOT NULL,
      action text NOT NULL CHECK (action IN ('baseline','create','update','delete','restore','import')),
      source text NOT NULL,
      mutation_id text,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resume_id, revision)
    );
    INSERT INTO resume_versions (resume_id,revision,document,deleted,action,source)
      SELECT id,revision,document,deleted_at IS NOT NULL,'baseline','migration' FROM resume_documents;
    CREATE FUNCTION record_resume_version() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.revision = NEW.revision THEN RETURN NULL; END IF;
      INSERT INTO resume_versions (resume_id,revision,document,deleted,action,source,mutation_id)
      VALUES (NEW.id,NEW.revision,NEW.document,NEW.deleted_at IS NOT NULL,
        CASE WHEN NEW.deleted_at IS NOT NULL THEN 'delete'
          WHEN nullif(current_setting('magic_resume.action',true),'') IS NOT NULL THEN current_setting('magic_resume.action',true)
          WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
        coalesce(nullif(current_setting('magic_resume.client',true),''),'web'),NEW.last_mutation_id);
      RETURN NULL;
    END $$;
    CREATE TRIGGER resume_version_after_write AFTER INSERT OR UPDATE ON resume_documents
      FOR EACH ROW EXECUTE FUNCTION record_resume_version();
  `,
}];

export async function migrateResumeDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(48260101)");
    await client.query("CREATE TABLE IF NOT EXISTS magic_resume_schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const migration of migrations) {
      const checksum = createHash("sha256").update(migration.sql).digest("hex");
      const existing = await client.query("SELECT checksum FROM magic_resume_schema_migrations WHERE version = $1", [migration.version]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error("Applied migration checksum changed");
        continue;
      }
      await client.query(migration.sql);
      if (migration.version === "001-resume-documents") {
        await client.query("INSERT INTO resume_workspace (storage_id) VALUES ($1)", [randomUUID()]);
      }
      await client.query("INSERT INTO magic_resume_schema_migrations (version, checksum) VALUES ($1, $2)", [migration.version, checksum]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
