import { migrateAISettings } from "../store/ai-config-migration";
import { ResumeStorageError } from "./resume-storage-contract";
import { AI_PROVIDER_DEFINITIONS, AI_PROVIDERS, type AIProvider } from "../config/ai-models";

export const WORKSPACE_KEYS = ["ai", "preferences", "file-sync"] as const;
export type WorkspaceKey = typeof WORKSPACE_KEYS[number];
export interface WorkspaceEntry { value: Record<string, any>; revision: number }
export interface WorkspaceSnapshot { storageId: string; entries: Partial<Record<WorkspaceKey, WorkspaceEntry>> }
export function workspaceKey(value: unknown): WorkspaceKey {
  if (!WORKSPACE_KEYS.includes(value as WorkspaceKey)) throw new ResumeStorageError("invalidSettingKey");
  return value as WorkspaceKey;
}
export function normalizeWorkspaceValue(key: WorkspaceKey, value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResumeStorageError("invalidSettings");
  const input = value as Record<string, any>;
  if (key === "ai") {
    if (!Array.isArray(input.models) || input.models.length > 128) throw new ResumeStorageError("invalidSettings");
    for (const model of input.models) {
      if (!model || typeof model !== "object" || Array.isArray(model) ||
          ["id", "name", "apiKey", "model", "baseUrl", "protocol"].some(field => typeof model[field] !== "string") ||
          !AI_PROVIDERS.includes(model.provider) || !AI_PROVIDER_DEFINITIONS[model.provider as AIProvider].protocols.includes(model.protocol)) {
        throw new ResumeStorageError("invalidSettings");
      }
    }
    for (const field of ["textModelId", "pdfModelId"]) {
      if (input[field] !== null && typeof input[field] !== "string") throw new ResumeStorageError("invalidSettings");
    }
    const normalized = migrateAISettings(input);
    if (normalized.models.length !== input.models.length) throw new ResumeStorageError("invalidSettings");
    for (const model of normalized.models) {
      if ([model.id, model.name, model.apiKey, model.model, model.baseUrl].some(v => v.length > 8192)) throw new ResumeStorageError("invalidSettings");
    }
    return normalized;
  }
  const allowed = key === "preferences" ? ["theme", "locale", "activeResumeId", "sidebarOpen"] : ["directoryName", "configured", "mode", "authorizedAt"];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new ResumeStorageError("invalidSettings");
  if (key === "preferences") {
    if (input.sidebarOpen !== undefined && typeof input.sidebarOpen !== "boolean") throw new ResumeStorageError("invalidSettings");
    if (input.theme !== undefined && !["light", "dark", "system"].includes(input.theme)) throw new ResumeStorageError("invalidSettings");
    if (input.locale !== undefined && !["zh", "en"].includes(input.locale)) throw new ResumeStorageError("invalidSettings");
    if (input.activeResumeId !== undefined && input.activeResumeId !== null && (typeof input.activeResumeId !== "string" || input.activeResumeId.length > 128)) throw new ResumeStorageError("invalidSettings");
  } else {
    if (typeof input.directoryName !== "string" || input.directoryName.length > 1024 || typeof input.configured !== "boolean" || !["read", "readwrite"].includes(input.mode)) throw new ResumeStorageError("invalidSettings");
    if (input.authorizedAt !== undefined && (typeof input.authorizedAt !== "string" || !Number.isFinite(Date.parse(input.authorizedAt)))) throw new ResumeStorageError("invalidSettings");
  }
  return structuredClone(input);
}
