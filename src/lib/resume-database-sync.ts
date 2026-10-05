import { useResumeStore, replaceDatabaseResumes } from "@/store/useResumeStore";
import { useResumeDatabaseStatus } from "@/store/useResumeDatabaseStatus";
import { normalizeResumeDocument, validateMutationId, validateResumeId, validateRevision } from "./resume-storage-contract";
import { importLegacyResumes, resumeTransport } from "./resume-storage-client";
import { ResumeSyncController, type ResumeOutbox } from "./resume-sync-controller";
import { savePreference, settingsValue } from "./workspace-settings-client";

export const LEGACY_STORAGE_KEY = "resume-storage";
export const OUTBOX_STORAGE_KEY = "resume-db-outbox-v1";
const MIGRATION_KEY = "resume-db-migration-v1";
const ACTIVE_KEY = "resume-db-active-id";
let controller: ResumeSyncController | undefined;
let startup: Promise<void> | undefined;
let disposeSubscription: (() => void) | undefined;
let moduleDisposed = false;
let memoryOutbox: ResumeOutbox | undefined = import.meta.hot?.data.outbox;
if (import.meta.hot) import.meta.hot.dispose(data => {
  // Development module replacement can reuse memory without browser storage.
  data.outbox = memoryOutbox;
  moduleDisposed = true; disposeSubscription?.();
});

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function removeLegacyKey(key: string) {
  try { localStorage.removeItem(key); } catch { /* Restricted browser storage. */ }
}

function readOutbox(): ResumeOutbox | undefined {
  const raw = readLocal(OUTBOX_STORAGE_KEY);
  if (!raw) return;
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("invalidRecovery"); }
  if (!value || typeof value.storageId !== "string" || !Array.isArray(value.changes)) throw new Error("invalidRecovery");
  const changes = value.changes.map((change: ResumeOutbox["changes"][number]) => {
    try {
      const id = validateResumeId(change.id);
      const resume = change.resume === null ? null : normalizeResumeDocument(change.resume);
      if (resume && resume.id !== id) throw new Error("invalidRecovery");
      return { id, resume, revision: validateRevision(change.revision), mutationId: validateMutationId(change.mutationId), conflicted: change.conflicted === true };
    } catch { throw new Error("invalidRecovery"); }
  });
  if (new Set(changes.map((c: { id: string }) => c.id)).size !== changes.length) throw new Error("invalidRecovery");
  return { storageId: value.storageId, changes };
}

function readLegacy() {
  const raw = readLocal(LEGACY_STORAGE_KEY);
  if (!raw) return { resumes: [], activeResumeId: null };
  try {
    const state = JSON.parse(raw)?.state;
    if (!state || !state.resumes || typeof state.resumes !== "object" || Array.isArray(state.resumes)) throw new Error();
    return { resumes: Object.values(state.resumes).map(normalizeResumeDocument), activeResumeId: typeof state.activeResumeId === "string" ? state.activeResumeId : null };
  } catch { throw new Error("invalidLegacy"); }
}

export function initializeResumeDatabase(skipLegacy = false): Promise<void> {
  if (moduleDisposed) return Promise.resolve();
  if (startup) return startup;
  useResumeDatabaseStatus.setState({ phase: "loading", initializationError: null });
  startup = (async () => {
    let snapshot = await resumeTransport.list();
    if (moduleDisposed) return;
    const recovery = memoryOutbox ?? readOutbox();
    const preferences = settingsValue("preferences");
    let activeId = Object.hasOwn(preferences, "activeResumeId") ? preferences.activeResumeId : readLocal(ACTIVE_KEY);
    if (!skipLegacy && readLocal(LEGACY_STORAGE_KEY)) {
      const legacy = readLegacy();
      // The server retains source documents and fingerprints in the same
      // transaction, including documents skipped because they were deleted.
      const result = await importLegacyResumes(legacy.resumes);
      if (moduleDisposed) return;
      activeId = activeId ?? (legacy.activeResumeId ? result.idMap[legacy.activeResumeId] : null);
      useResumeDatabaseStatus.setState({ migrated: { imported: result.imported, copied: result.copied } });
      snapshot = await resumeTransport.list();
      if (moduleDisposed) return;
      removeLegacyKey(LEGACY_STORAGE_KEY);
    }
    removeLegacyKey(MIGRATION_KEY);
    removeLegacyKey(ACTIVE_KEY);
    controller = new ResumeSyncController({
      transport: resumeTransport,
      read: () => useResumeStore.getState().resumes,
      replace: replaceDatabaseResumes,
      persist: (outbox) => {
        memoryOutbox = outbox;
        // An existing disk queue is removed only once all recovered changes
        // have committed (or their conflicts were explicitly resolved).
        if (!outbox.changes.length) removeLegacyKey(OUTBOX_STORAGE_KEY);
      },
      status: (state) => useResumeDatabaseStatus.setState(state),
    });
    controller.initialize(snapshot, recovery);
    if (activeId) useResumeStore.getState().setActiveResume(activeId);
    const selected = useResumeStore.getState().activeResumeId;
    if (selected && selected !== preferences.activeResumeId) savePreference("activeResumeId", selected);
    const currentController = controller;
    const unsubscribe = useResumeStore.subscribe((next, previous) => {
      currentController.observe(next.resumes, previous.resumes);
      if (next.activeResumeId !== previous.activeResumeId) {
        savePreference("activeResumeId", next.activeResumeId);
      }
    });
    const poll = setInterval(() => { if (document.visibilityState === "visible") void currentController.refresh(); }, 2000);
    const retry = () => { void currentController.retry(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (currentController.hasPending()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", beforeUnload);
    disposeSubscription = () => {
      unsubscribe(); clearInterval(poll); currentController.dispose();
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
      window.removeEventListener("beforeunload", beforeUnload);
    };
    await controller.flush();
    if (moduleDisposed) return;
    useResumeDatabaseStatus.setState({ phase: "ready" });
  })().catch((error) => {
    if (moduleDisposed) return;
    startup = undefined;
    useResumeDatabaseStatus.setState({ phase: "error", initializationError: error instanceof Error ? error.message : "requestFailed" });
  });
  return startup;
}

export const retryResumeDatabase = () => controller ? controller.retry() : initializeResumeDatabase();
export const resolveResumeConflict = (id: string, choice: "server" | "copy") => controller?.resolveConflict(id, choice);
export const flushResumeDatabase = () => controller?.flush();

export function downloadResumeRecovery() {
  const data = {
    exportedAt: new Date().toISOString(),
    legacy: readLocal(LEGACY_STORAGE_KEY),
    pending: memoryOutbox ?? readLocal(OUTBOX_STORAGE_KEY),
    currentResumes: Object.values(useResumeStore.getState().resumes),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "magic-resume-recovery.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
