import type { ResumeData } from "@/types/resume";
import { blankResumeState } from "@/config/initialResumeData";

export interface StoredResume { resume: ResumeData; revision: number }
export interface ResumeSnapshot { storageId: string; resumes: StoredResume[] }
export interface LegacyImportResult {
  storageId: string;
  imported: number;
  copied: number;
  skipped: number;
  idMap: Record<string, string>;
}

export class ResumeStorageError extends Error {
  constructor(public code: string, public status = 400, public current?: StoredResume | null) {
    super(code);
  }
}

export function validateResumeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ||
      ["__proto__", "prototype", "constructor"].includes(value)) {
    throw new ResumeStorageError("invalidResumeId");
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResumeStorageError("invalidResume");
  return value as Record<string, unknown>;
}

// Fill only absent legacy fields. Never replace supplied content with sample data.
export function normalizeResumeDocument(value: unknown): ResumeData {
  const input = object(value);
  const id = validateResumeId(input.id);
  if (typeof input.title !== "string" || input.title.length > 512) throw new ResumeStorageError("invalidResume");
  for (const key of ["createdAt", "updatedAt"] as const) {
    if (typeof input[key] !== "string" || !Number.isFinite(Date.parse(input[key]))) throw new ResumeStorageError("invalidResumeDate");
  }
  const basic = { ...blankResumeState.basic, ...object(input.basic) };
  for (const key of ["name", "title", "email", "phone", "location", "birthDate", "employementStatus", "photo", "githubKey", "githubUseName"]) {
    if (typeof (basic as Record<string, unknown>)[key] !== "string") throw new ResumeStorageError("invalidResume");
  }
  if (!Array.isArray(basic.customFields)) throw new ResumeStorageError("invalidResume");
  object(basic.photoConfig);
  object(basic.icons);
  const resume = {
    ...structuredClone(blankResumeState),
    ...input,
    id,
    title: input.title,
    createdAt: input.createdAt as string,
    updatedAt: input.updatedAt as string,
    templateId: input.templateId ?? null,
    basic,
    customData: input.customData ?? {},
    globalSettings: input.globalSettings ?? {},
    activeSection: input.activeSection ?? "basic",
    draggingProjectId: input.draggingProjectId ?? null,
  };
  for (const key of ["education", "experience", "projects", "certificates", "menuSections"] as const) {
    if (!Array.isArray(resume[key])) throw new ResumeStorageError("invalidResume");
    for (const item of resume[key]) object(item);
  }
  for (const key of ["skillContent", "selfEvaluationContent", "activeSection"] as const) {
    if (typeof resume[key] !== "string") throw new ResumeStorageError("invalidResume");
  }
  object(resume.globalSettings);
  for (const items of Object.values(object(resume.customData))) {
    if (!Array.isArray(items)) throw new ResumeStorageError("invalidResume");
    for (const item of items) object(item);
  }
  if (resume.templateId != null && typeof resume.templateId !== "string") throw new ResumeStorageError("invalidResume");
  return resume as unknown as ResumeData;
}

export function validateRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new ResumeStorageError("invalidRevision");
  return value as number;
}

export function validateMutationId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) throw new ResumeStorageError("invalidMutationId");
  return value;
}
