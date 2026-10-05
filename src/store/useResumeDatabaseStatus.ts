import { create } from "zustand";
import type { ResumeSyncState } from "@/lib/resume-sync-controller";

interface DatabaseStatus extends ResumeSyncState {
  phase: "idle" | "loading" | "ready" | "error";
  initializationError: string | null;
  migrated: { imported: number; copied: number } | null;
}
export const useResumeDatabaseStatus = create<DatabaseStatus>(() => ({
  phase: "idle", initializationError: null, migrated: null,
  saving: false, pending: 0, error: null, backupFailed: false, conflicts: [],
}));
