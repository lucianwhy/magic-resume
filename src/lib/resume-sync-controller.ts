import type { ResumeData } from "@/types/resume";
import type { ResumeSnapshot, StoredResume } from "./resume-storage-contract";
import { ResumeClientError, type ResumeTransport } from "./resume-storage-client";

export interface PendingResumeChange { id: string; resume: ResumeData | null; revision: number; mutationId: string; conflicted?: boolean }
export interface ResumeOutbox { storageId: string; changes: PendingResumeChange[] }
export interface ResumeSyncState {
  saving: boolean;
  pending: number;
  error: string | null;
  backupFailed: boolean;
  conflicts: { id: string; title: string; deleted: boolean }[];
}
interface Options {
  transport: ResumeTransport;
  read(): Record<string, ResumeData>;
  replace(resumes: Record<string, ResumeData>, preserveHistory?: boolean): void;
  persist(outbox: ResumeOutbox): void;
  status(state: ResumeSyncState): void;
  uuid?: () => string;
}

// All writes are serialized. Acknowledgements advance revisions without
// replacing a newer local edit. Polling never applies an old in-flight read.
export class ResumeSyncController {
  private baseline = new Map<string, StoredResume>();
  private pending = new Map<string, PendingResumeChange>();
  private conflicts = new Map<string, StoredResume | null>();
  private blocked = new Set<string>();
  private storageId = "";
  private applying = false;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private processing?: Promise<void>;
  private refreshing = false;
  private error: string | null = null;
  private backupFailed = false;
  private databaseChanged = false;
  private disposed = false;
  constructor(private options: Options) {}
  private uuid() { return this.options.uuid?.() ?? crypto.randomUUID(); }

  initialize(snapshot: ResumeSnapshot, recovery?: ResumeOutbox) {
    this.storageId = snapshot.storageId;
    this.baseline = new Map(snapshot.resumes.map(record => [record.resume.id, record]));
    const resumes = Object.fromEntries(snapshot.resumes.map(record => [record.resume.id, record.resume]));
    if (recovery) for (const change of recovery.changes) {
      this.pending.set(change.id, change);
      if (change.resume) resumes[change.id] = change.resume; else delete resumes[change.id];
      if (change.conflicted || recovery.storageId !== snapshot.storageId) this.conflicts.set(change.id, this.baseline.get(change.id) ?? null);
    }
    this.apply(resumes);
    this.persist();
    this.emit();
  }

  private apply(resumes: Record<string, ResumeData>, preserveHistory = false) {
    this.applying = true;
    try { this.options.replace(resumes, preserveHistory); } finally { this.applying = false; }
  }
  private persist() {
    try { this.options.persist({ storageId: this.storageId, changes: [...this.pending.values()].map(change => ({ ...change, conflicted: this.conflicts.has(change.id) })) }); this.backupFailed = false; }
    catch { this.backupFailed = true; }
  }
  private emit() {
    if (this.disposed) return;
    this.options.status({
      saving: !!this.processing, pending: this.pending.size, error: this.error, backupFailed: this.backupFailed,
      conflicts: [...this.conflicts].map(([id]) => ({ id, title: this.pending.get(id)?.resume?.title ?? this.baseline.get(id)?.resume.title ?? id, deleted: this.pending.get(id)?.resume === null })),
    });
  }
  hasPending() { return this.pending.size > 0; }
  dispose() { this.disposed = true; clearTimeout(this.timer); }

  observe(next: Record<string, ResumeData>, previous: Record<string, ResumeData>) {
    if (this.disposed || this.applying || next === previous) return;
    for (const id of new Set([...Object.keys(next), ...Object.keys(previous)])) {
      if (next[id] === previous[id]) continue;
      const old = this.pending.get(id);
      this.pending.set(id, { id, resume: next[id] ?? null, revision: old?.revision ?? this.baseline.get(id)?.revision ?? 0, mutationId: this.uuid() });
      this.blocked.delete(id);
      this.generation++;
    }
    this.error = this.databaseChanged ? "databaseChanged" : null;
    this.persist(); this.emit(); this.schedule(400);
  }

  private schedule(delay: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, delay);
  }
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.processing) return this.processing;
    clearTimeout(this.timer);
    this.processing = this.process();
    this.emit();
    try { await this.processing; }
    finally { this.processing = undefined; this.emit(); }
  }
  private async process() {
    if (this.disposed || this.databaseChanged) return;
    while (true) {
      if (this.disposed) return;
      const change = [...this.pending.values()].find(item => !this.conflicts.has(item.id) && !this.blocked.has(item.id));
      if (!change) return;
      try {
        let saved: StoredResume | null = null;
        if (change.resume) saved = await this.options.transport.put(change.resume, change.revision, change.mutationId);
        else if (change.revision > 0) await this.options.transport.delete(change.id, change.revision, change.mutationId);
        else {
          // A create may have committed before its response was lost. Do not
          // claim deletion succeeded or delete a document whose revision we
          // never acknowledged.
          const current = await this.options.transport.get(change.id);
          if (current) throw new ResumeClientError("revisionConflict", 409, current);
        }
        // Do not let a disposed controller overwrite the replacement state.
        // A committed write can be retried using the same mutation ID.
        if (this.disposed) return;
        if (saved) this.baseline.set(change.id, saved); else this.baseline.delete(change.id);
        this.generation++;
        const latest = this.pending.get(change.id);
        if (latest === change) {
          this.pending.delete(change.id);
          const resumes = { ...this.options.read() };
          if (saved) resumes[change.id] = saved.resume; else delete resumes[change.id];
          this.apply(resumes, true);
        } else if (latest) {
          // An edit or deletion queued during this successful write is based on
          // our newly acknowledged revision, not the previous server version.
          latest.revision = saved?.revision ?? 0;
        }
        this.error = null;
        this.persist(); this.emit();
      } catch (error) {
        if (this.disposed) return;
        if (error instanceof ResumeClientError && error.status === 409) {
          this.conflicts.set(change.id, error.current ?? null);
          this.error = "revisionConflict";
        } else {
          this.error = error instanceof ResumeClientError ? error.code : "connectionFailed";
          if (error instanceof ResumeClientError && error.status < 500) this.blocked.add(change.id);
          else this.schedule(5000);
        }
        this.persist(); this.emit(); return;
      }
    }
  }

  async refresh() {
    if (this.disposed || this.databaseChanged || this.refreshing || this.processing || this.pending.size) return;
    this.refreshing = true;
    const generation = this.generation;
    try {
      const snapshot = await this.options.transport.list();
      if (this.disposed || generation !== this.generation || this.pending.size) return;
      if (snapshot.storageId !== this.storageId) { this.databaseChanged = true; this.error = "databaseChanged"; this.emit(); return; }
      const resumes: Record<string, ResumeData> = {};
      for (const record of snapshot.resumes) {
        const previous = this.baseline.get(record.resume.id);
        resumes[record.resume.id] = previous?.revision === record.revision ? this.options.read()[record.resume.id] : record.resume;
      }
      this.baseline = new Map(snapshot.resumes.map(record => [record.resume.id, record]));
      this.apply(resumes);
      this.error = null; this.emit();
    } catch { this.error = "connectionFailed"; this.emit(); }
    finally { this.refreshing = false; }
  }

  async retry() {
    if (this.databaseChanged) { this.error = "databaseChanged"; this.emit(); return; }
    this.blocked.clear(); this.error = null; await this.flush(); await this.refresh();
  }

  async resolveConflict(id: string, choice: "server" | "copy") {
    if (this.disposed) return;
    const change = this.pending.get(id);
    if (!change || !this.conflicts.has(id)) return;
    const current = await this.options.transport.get(id);
    if (this.disposed) return;
    const resumes = { ...this.options.read() };
    if (current) { resumes[id] = current.resume; this.baseline.set(id, current); }
    else { delete resumes[id]; this.baseline.delete(id); }
    if (choice === "copy" && change.resume) {
      const copy = { ...structuredClone(change.resume), id: this.uuid(), title: `${change.resume.title.slice(0, 500)} (副本)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      resumes[copy.id] = copy;
      this.pending.set(copy.id, { id: copy.id, resume: copy, revision: 0, mutationId: this.uuid() });
    }
    this.pending.delete(id); this.conflicts.delete(id); this.blocked.delete(id);
    this.generation++; this.apply(resumes); this.error = null; this.persist(); this.emit();
    await this.flush(); await this.refresh();
  }
}
