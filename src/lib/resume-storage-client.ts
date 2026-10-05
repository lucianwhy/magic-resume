import type { ResumeData } from "@/types/resume";
import type { LegacyImportResult, ResumeSnapshot, StoredResume } from "./resume-storage-contract";

export class ResumeClientError extends Error {
  constructor(public code: string, public status: number, public current?: StoredResume | null) { super(code); }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: "no-store", credentials: "same-origin",
    signal: AbortSignal.timeout(30000),
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new ResumeClientError(data.code ?? "requestFailed", response.status, data.current);
  return data;
}

export interface ResumeTransport {
  list(): Promise<ResumeSnapshot>;
  get(id: string): Promise<StoredResume | null>;
  put(resume: ResumeData, revision: number, mutationId: string): Promise<StoredResume>;
  delete(id: string, revision: number, mutationId: string): Promise<unknown>;
}

let snapshotCache: { etag: string | null; value: ResumeSnapshot } | undefined;
async function listResumes(): Promise<ResumeSnapshot> {
  const response = await fetch("/api/resumes/", {
    cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(30000),
    headers: snapshotCache?.etag ? { "If-None-Match": snapshotCache.etag } : {},
  });
  if (response.status === 304 && snapshotCache) return snapshotCache.value;
  const data = await response.json();
  if (!response.ok) throw new ResumeClientError(data.code ?? "requestFailed", response.status);
  snapshotCache = { etag: response.headers.get("ETag"), value: data };
  return data;
}

export const resumeTransport: ResumeTransport = {
  list: listResumes,
  get: async (id) => {
    try { return await request<StoredResume>(`/api/resumes/${encodeURIComponent(id)}`); }
    catch (error) { if (error instanceof ResumeClientError && error.status === 404) return null; throw error; }
  },
  put: (resume, expectedRevision, mutationId) => request<StoredResume>(`/api/resumes/${encodeURIComponent(resume.id)}`, "PUT", { resume, expectedRevision, mutationId }),
  delete: (id, expectedRevision, mutationId) => request(`/api/resumes/${encodeURIComponent(id)}`, "DELETE", { expectedRevision, mutationId }),
};

export const importLegacyResumes = (resumes: ResumeData[]) => request<LegacyImportResult>("/api/resumes/", "POST", { resumes });
