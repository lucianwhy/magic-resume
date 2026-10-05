import { create } from "zustand";
import type { WorkspaceEntry, WorkspaceKey, WorkspaceSnapshot } from "./workspace-settings-contract";

interface SettingsState {
  phase: "idle" | "loading" | "ready" | "error";
  snapshot: WorkspaceSnapshot | null;
  pending: number;
  error: string | null;
}
export const useWorkspaceSettings = create<SettingsState>(() => ({ phase: "idle", snapshot: null, pending: 0, error: null }));
const pending = new Map<WorkspaceKey, { value: Record<string, any>; mutationId: string }>();
let attempt: { key: WorkspaceKey; change: { value: Record<string, any>; mutationId: string }; revision: number } | undefined;
let generation = 0;
let startup: Promise<void> | undefined, flushing: Promise<void> | undefined, disposed = false;
let poll: ReturnType<typeof setInterval> | undefined;
if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; clearInterval(poll); });

async function request<T>(method: string, key?: WorkspaceKey, value?: unknown): Promise<T> {
  const response = await fetch(`/api/workspace/${key ?? ""}`, {
    method, cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(30000),
    ...(value === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? "requestFailed");
  return data;
}
export function initializeWorkspaceSettings(legacy: () => Promise<Record<string, unknown>>): Promise<void> {
  if (startup) return startup;
  useWorkspaceSettings.setState({ phase: "loading", error: null });
  startup = (async () => {
    const values = await legacy();
    const snapshot = Object.keys(values).length ? await request<WorkspaceSnapshot>("POST", undefined, values) : await request<WorkspaceSnapshot>("GET");
    if (disposed) return;
    useWorkspaceSettings.setState({ phase: "ready", snapshot, error: null });
    poll = setInterval(() => { if (document.visibilityState === "visible") void refreshWorkspaceSettings(); }, 2500);
  })().catch(error => {
    startup = undefined;
    useWorkspaceSettings.setState({ phase: "error", error: error instanceof Error ? error.message : "requestFailed" });
    throw error;
  });
  return startup;
}
export function settingsValue(key: WorkspaceKey): Record<string, any> {
  return useWorkspaceSettings.getState().snapshot?.entries[key]?.value ?? {};
}
export function saveWorkspaceValue(key: WorkspaceKey, value: Record<string, any>) {
  const state = useWorkspaceSettings.getState();
  if (state.phase !== "ready" || !state.snapshot) throw new Error("settingsNotReady");
  if (JSON.stringify(settingsValue(key)) === JSON.stringify(value)) return;
  pending.set(key, { value: structuredClone(value), mutationId: crypto.randomUUID() });
  generation++;
  useWorkspaceSettings.setState({ snapshot: { ...state.snapshot, entries: { ...state.snapshot.entries, [key]: { value, revision: state.snapshot.entries[key]?.revision ?? 0 } } }, pending: pending.size });
  void flushWorkspaceSettings();
}
export function savePreference(key: "theme" | "locale" | "activeResumeId" | "sidebarOpen", value: string | boolean | null) {
  saveWorkspaceValue("preferences", { ...settingsValue("preferences"), [key]: value });
}
export function flushWorkspaceSettings(): Promise<void> {
  if (flushing) return flushing;
  if (!pending.size && !attempt) return Promise.resolve();
  // A conflict/database change requires an explicit reload, never a blind retry.
  if (["settingsConflict", "databaseChanged"].includes(useWorkspaceSettings.getState().error ?? "")) return Promise.resolve();
  flushing = (async () => {
    try {
      while (pending.size || attempt) {
        const snapshot = useWorkspaceSettings.getState().snapshot!;
        if (!attempt) {
          const [key, change] = pending.entries().next().value!;
          attempt = { key, change, revision: snapshot.entries[key]?.revision ?? 0 };
        }
        const { key, change, revision } = attempt;
        const saved = await request<WorkspaceEntry>("PUT", key, { value: change.value, expectedRevision: revision, mutationId: change.mutationId, storageId: snapshot.storageId });
        if (disposed) return;
        attempt = undefined;
        const latest = useWorkspaceSettings.getState().snapshot!;
        if (pending.get(key) === change) pending.delete(key);
        useWorkspaceSettings.setState({ snapshot: { ...latest, entries: { ...latest.entries, [key]: { value: pending.get(key)?.value ?? saved.value, revision: saved.revision } } }, pending: pending.size, error: null });
      }
    } catch (error) { useWorkspaceSettings.setState({ error: error instanceof Error ? error.message : "requestFailed" }); }
    finally { flushing = undefined; }
  })();
  return flushing;
}
export async function refreshWorkspaceSettings() {
  const state = useWorkspaceSettings.getState();
  if (state.phase !== "ready" || pending.size || flushing || disposed || state.error === "databaseChanged") return;
  const before = generation;
  try {
    const snapshot = await request<WorkspaceSnapshot>("GET");
    const latest = useWorkspaceSettings.getState();
    if (pending.size || disposed || generation !== before) return;
    if (snapshot.storageId !== latest.snapshot?.storageId) { useWorkspaceSettings.setState({ error: "databaseChanged" }); return; }
    if (JSON.stringify(snapshot) !== JSON.stringify(latest.snapshot)) useWorkspaceSettings.setState({ snapshot });
    if (latest.error !== "databaseChanged") useWorkspaceSettings.setState({ error: null });
  } catch { useWorkspaceSettings.setState({ error: "requestFailed" }); }
}
export async function reloadWorkspaceSettings() {
  // A write already in flight must settle before discarding local edits.
  await flushing;
  const snapshot = await request<WorkspaceSnapshot>("GET");
  pending.clear(); attempt = undefined; generation++; useWorkspaceSettings.setState({ phase: "ready", snapshot, pending: 0, error: null });
}
export function exportPendingSettings() {
  let legacyAI: string | null = null;
  try { legacyAI = localStorage.getItem("ai-config-storage"); } catch { /* Restricted storage. */ }
  const state = useWorkspaceSettings.getState();
  const payload = {
    exportedAt: new Date().toISOString(), storageId: state.snapshot?.storageId,
    current: Object.fromEntries(Object.entries(state.snapshot?.entries ?? {}).map(([key, entry]) => [key, entry.value])),
    pending: Object.fromEntries([...pending].map(([key, entry]) => [key, entry.value])),
    ...(legacyAI ? { legacyAI } : {}),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "magic-resume-pending-settings.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
