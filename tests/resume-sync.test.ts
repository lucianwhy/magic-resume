import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { blankResumeState } from "../src/config/initialResumeData";
import { ResumeSyncController, type ResumeOutbox, type ResumeSyncState } from "../src/lib/resume-sync-controller";
import { ResumeClientError, type ResumeTransport } from "../src/lib/resume-storage-client";
import type { ResumeData } from "../src/types/resume";
import type { ResumeSnapshot, StoredResume } from "../src/lib/resume-storage-contract";

const document = (): ResumeData => ({ ...structuredClone(blankResumeState), id: randomUUID(), title: "Test", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), templateId: "classic", activeSection: "basic", draggingProjectId: null });
function fixture(initial: StoredResume[] = []) {
  let resumes: Record<string, ResumeData> = {};
  const database = new Map(initial.map(record => [record.resume.id, record]));
  let outbox: ResumeOutbox = { storageId: "test", changes: [] };
  let status: ResumeSyncState;
  const writes: number[] = []; let preserveHistory = false;
  const transport: ResumeTransport = {
    list: async () => ({ storageId: "test", resumes: [...database.values()] }),
    get: async id => database.get(id) ?? null,
    put: async (resume, revision) => {
      const existing = database.get(resume.id);
      if ((existing?.revision ?? 0) !== revision) throw new ResumeClientError("revisionConflict", 409, existing ?? null);
      writes.push(revision);
      const saved = { resume: { ...resume }, revision: revision + 1 }; database.set(resume.id, saved); return saved;
    },
    delete: async (id, revision) => { assert.equal(database.get(id)?.revision, revision); database.delete(id); },
  };
  const controller = new ResumeSyncController({ transport, read: () => resumes, replace: (next, preserve) => { resumes = next; preserveHistory = !!preserve; }, persist: data => { outbox = structuredClone(data); }, status: state => { status = state; } });
  controller.initialize({ storageId: "test", resumes: initial });
  const edit = (next: Record<string, ResumeData>) => { const previous = resumes; resumes = next; controller.observe(next, previous); };
  return { controller, transport, database, writes, edit, get resumes() { return resumes; }, get outbox() { return outbox; }, get status() { return status!; }, get preserveHistory() { return preserveHistory; } };
}

test("newer edits queued during a write survive its acknowledgement", async () => {
  const resume = document(); const f = fixture([{ resume, revision: 1 }]);
  const original = f.transport.put;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const start = new Promise<void>(resolve => { started = resolve; });
  f.transport.put = async (...args) => { started(); await gate; return original(...args); };
  f.edit({ [resume.id]: { ...resume, title: "edit 1" } }); const flush = f.controller.flush(); await start;
  f.edit({ [resume.id]: { ...resume, title: "edit 2" } }); release(); await flush;
  assert.equal(f.resumes[resume.id].title, "edit 2"); assert.equal(f.database.get(resume.id)?.revision, 3);
  assert.deepEqual(f.writes, [1, 2]); assert.equal(f.outbox.changes.length, 0); assert.equal(f.preserveHistory, true);
});

test("an in-flight old poll cannot erase a new edit", async () => {
  const resume = document(); const f = fixture([{ resume, revision: 1 }]);
  let release!: (snapshot: ResumeSnapshot) => void;
  f.transport.list = () => new Promise(resolve => { release = resolve; });
  const poll = f.controller.refresh(); f.edit({ [resume.id]: { ...resume, title: "pending edit" } });
  release({ storageId: "test", resumes: [{ resume, revision: 1 }] }); await poll;
  assert.equal(f.resumes[resume.id].title, "pending edit"); await f.controller.flush();
});

test("failed writes are retained in the recovery queue and replayed after restart", async () => {
  const resume = document(); const f = fixture();
  f.transport.put = async () => { throw new ResumeClientError("databaseUnavailable", 503); };
  f.edit({ [resume.id]: resume }); await f.controller.flush();
  assert.equal(f.outbox.changes[0].resume?.id, resume.id); assert.equal(f.status.pending, 1);
  const restarted = fixture(); restarted.controller.initialize({ storageId: "test", resumes: [] }, f.outbox);
  await restarted.controller.flush(); assert.equal(restarted.database.get(resume.id)?.resume.title, resume.title);
  // Replace the failing transport before its scheduled retry to leave no timer.
  f.transport.put = async () => ({ resume, revision: 1 }); await f.controller.retry();
});

test("conflicts retain local edits and allow saving a separate copy", async () => {
  const resume = document(); const f = fixture([{ resume, revision: 1 }]);
  f.database.set(resume.id, { resume: { ...resume, title: "external" }, revision: 2 });
  f.edit({ [resume.id]: { ...resume, title: "local" } }); await f.controller.flush();
  assert.equal(f.resumes[resume.id].title, "local"); assert.equal(f.status.conflicts.length, 1);
  await f.controller.resolveConflict(resume.id, "copy");
  assert.equal(f.resumes[resume.id].title, "external");
  assert.ok(Object.values(f.resumes).some(r => r.id !== resume.id && r.title.startsWith("local")));
  assert.equal(f.status.conflicts.length, 0); assert.equal(f.status.pending, 0);
});

test("external edits and deletions appear on refresh without creating writes", async () => {
  const resume = document(); const f = fixture([{ resume, revision: 1 }]);
  f.database.set(resume.id, { resume: { ...resume, title: "CLI edit" }, revision: 2 }); await f.controller.refresh();
  assert.equal(f.resumes[resume.id].title, "CLI edit");
  f.database.delete(resume.id); await f.controller.refresh(); assert.equal(f.resumes[resume.id], undefined);
  assert.deepEqual(f.writes, []);
});

test("a deletion queued while a create is in flight uses the acknowledged revision", async () => {
  const resume = document(); const f = fixture(); const original = f.transport.put;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const start = new Promise<void>(resolve => { started = resolve; });
  f.transport.put = async (...args) => { started(); await gate; return original(...args); };
  f.edit({ [resume.id]: resume }); const flush = f.controller.flush(); await start; f.edit({}); release(); await flush;
  assert.equal(f.database.has(resume.id), false); assert.equal(f.status.pending, 0);
});

test("recovery data from a different database is never silently written", async () => {
  const resume = document(); const f = fixture();
  f.controller.initialize({ storageId: "test", resumes: [] }, { storageId: "another database", changes: [{ id: resume.id, resume, revision: 0, mutationId: randomUUID() }] });
  await f.controller.flush(); assert.equal(f.database.size, 0); assert.equal(f.status.conflicts.length, 1);
  const recoveredAgain = fixture(); recoveredAgain.controller.initialize({ storageId: "test", resumes: [] }, f.outbox);
  await recoveredAgain.controller.flush(); assert.equal(recoveredAgain.database.size, 0); assert.equal(recoveredAgain.status.conflicts.length, 1);
  await f.controller.resolveConflict(resume.id, "copy"); assert.equal(f.database.size, 1); assert.equal(f.database.has(resume.id), false);
});

test("deleting after a lost create response does not falsely acknowledge deletion", async () => {
  const resume = document(); const f = fixture();
  f.database.set(resume.id, { resume, revision: 1 });
  f.edit({ [resume.id]: resume }); f.edit({}); await f.controller.flush();
  assert.equal(f.database.has(resume.id), true); assert.equal(f.status.conflicts.length, 1); assert.equal(f.status.pending, 1);
  await f.controller.resolveConflict(resume.id, "server");
});

test("a database switch freezes writes and keeps the reload warning during edits and retries", async () => {
  const resume = document(); const f = fixture([{ resume, revision: 1 }]);
  f.transport.list = async () => ({ storageId: "replacement", resumes: [] });
  await f.controller.refresh(); assert.equal(f.status.error, "databaseChanged");
  f.edit({ [resume.id]: { ...resume, title: "unsaved after switch" } });
  await f.controller.flush(); await f.controller.retry();
  assert.equal(f.status.error, "databaseChanged"); assert.equal(f.status.pending, 1);
  assert.equal(f.outbox.storageId, "test"); assert.deepEqual(f.writes, []);
});

test("disposing a controller during a write preserves recovery and stops old subscriptions", async () => {
  const resume = document(); const f = fixture(); const original = f.transport.put;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const start = new Promise<void>(resolve => { started = resolve; });
  f.transport.put = async (...args) => { started(); await gate; return original(...args); };
  f.edit({ [resume.id]: resume }); const pending = f.controller.flush(); await start;
  const recovery = structuredClone(f.outbox);
  f.controller.dispose(); release(); await pending;
  assert.deepEqual(f.outbox, recovery); assert.equal(f.database.get(resume.id)?.revision, 1);
  f.edit({ [resume.id]: { ...resume, title: "replacement controller edit" } });
  await f.controller.flush(); assert.deepEqual(f.writes, [0]);
});
