import { AgentError, patchResume, assertJSON } from "../lib/resume-edit";
export { AgentError, patchResume, assertJSON, validateAgentResume } from "../lib/resume-edit";
import { randomUUID } from "node:crypto";
import { blankResumeState, blankResumeStateEn } from "../config/initialResumeData";
import { normalizeResumeDocument, validateMutationId, validateResumeId, validateRevision } from "../lib/resume-storage-contract";
import type { ResumeData } from "../types/resume";
import type { ResumeSnapshot, StoredResume } from "../lib/resume-storage-contract";

export const DEFAULT_API_URL = "http://127.0.0.1:3000";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const SECTIONS = ["basic", "education", "experience", "projects", "certificates", "customData", "skillContent", "selfEvaluationContent", "menuSections", "globalSettings"] as const;
export type Section = typeof SECTIONS[number];
export function apiURL(value = process.env.MAGIC_RESUME_API_URL ?? DEFAULT_API_URL): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AgentError("invalidAPIURL", "API URL must be a local HTTP origin."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new AgentError("invalidAPIURL", "Use a local HTTP origin, for example http://127.0.0.1:3000.");
  }
  return url.origin;
}

export function projectResume(record: StoredResume, options: { sections?: Section[]; includeImages?: boolean } = {}) {
  const resume = structuredClone(record.resume) as unknown as Record<string, unknown>;
  const omittedFields = ["basic.githubKey"];
  const basic = resume.basic as Record<string, unknown>; delete basic.githubKey;
  if (!options.includeImages) {
    delete basic.photo; omittedFields.push("basic.photo", "certificates[].url");
    for (const item of resume.certificates as Record<string, unknown>[]) delete item.url;
  }
  if (options.sections?.length) {
    const keep = new Set(["id", "title", "templateId", "createdAt", "updatedAt", ...options.sections]);
    for (const key of Object.keys(resume)) if (!keep.has(key)) delete resume[key];
  }
  return { resume, revision: record.revision, omittedFields };
}
export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof AgentError) return {
    code: error.code, message: error.message, status: error.status,
    ...(error.current !== undefined ? { current: error.current ? projectResume(error.current) : null } : {}),
    ...(error.mutationId ? { mutationId: error.mutationId } : {}),
    ...(error.resumeId ? { resumeId: error.resumeId } : {}),
  };
  if (error instanceof Error && /^invalid/.test(error.message)) return { code: error.message, message: "Invalid resume input.", status: 400 };
  return { code: "requestFailed", message: "Operation failed. Check the local web server and input.", status: 500 };
}

export class ResumeAgentClient {
  readonly origin: string;
  constructor(origin?: string, private source: "cli" | "mcp" = "cli") { this.origin = apiURL(origin); }
  private async request<T>(path: string, method = "GET", body?: unknown, workspace = false): Promise<T> {
    const mutationId = object(body) && typeof body.mutationId === "string" ? body.mutationId : undefined;
    try {
      const response = await fetch(`${this.origin}${workspace ? "/api/workspace/ai-control" : "/api/resumes/"}${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(workspace ? 150000 : 30000),
        headers: { "X-Magic-Resume-Client": this.source, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let data;
      try { data = await response.json(); } catch { throw new AgentError("invalidResponse", "Web server did not return resume API JSON.", 502, undefined, mutationId); }
      if (!response.ok) throw new AgentError(data.code ?? "requestFailed", response.status === 409 ? "Version conflict. Read the current resume and review your patch before retrying." : `Resume API returned HTTP ${response.status}.`, response.status, data.current, mutationId);
      return data;
    } catch (error) {
      if (error instanceof AgentError) throw error;
      throw new AgentError("connectionFailed", "Cannot reach the local resume API. Start PostgreSQL, apply migrations and run the web server. A write may have committed: inspect the current version before retrying.", 503, undefined, mutationId);
    }
  }
  snapshot() { return this.request<ResumeSnapshot>(""); }
  async list() {
    const snapshot = await this.snapshot();
    return { storageId: snapshot.storageId, webURL: this.origin, resumes: snapshot.resumes.map(({ resume, revision }) => ({ id: resume.id, title: resume.title, templateId: resume.templateId, updatedAt: resume.updatedAt, revision, webURL: `${this.origin}/app/workbench/${encodeURIComponent(resume.id)}` })) };
  }
  get(id: string) { validateResumeId(id); return this.request<StoredResume>(encodeURIComponent(id)); }
  async create(options: { title: string; locale?: "zh" | "en"; id?: string; mutationId?: string; patch?: unknown }) {
    const now = new Date().toISOString();
    let resume = normalizeResumeDocument({ ...structuredClone(options.locale === "en" ? blankResumeStateEn : blankResumeState), id: options.id ?? randomUUID(), title: options.title, templateId: "classic", createdAt: now, updatedAt: now });
    if (options.patch !== undefined) resume = patchResume(resume, options.patch);
    const mutationId = validateMutationId(options.mutationId ?? randomUUID());
    let saved: StoredResume;
    try { saved = await this.request<StoredResume>(encodeURIComponent(resume.id), "PUT", { resume, expectedRevision: 0, mutationId }); }
    catch (error) { if (error instanceof AgentError) error.resumeId = resume.id; throw error; }
    return { ...projectResume(saved), mutationId, webURL: `${this.origin}/app/workbench/${saved.resume.id}` };
  }
  async update(id: string, expectedRevision: number, patch: unknown, mutationId: string = randomUUID()) {
    validateRevision(expectedRevision); validateMutationId(mutationId);
    const current = await this.get(id);
    if (current.revision !== expectedRevision) throw new AgentError("revisionConflict", "Version conflict. Read the current resume and review your patch before retrying.", 409, current, mutationId);
    const resume = patchResume(current.resume, patch);
    const saved = await this.request<StoredResume>(encodeURIComponent(id), "PUT", { resume, expectedRevision, mutationId });
    return { ...projectResume(saved), mutationId };
  }
  async delete(id: string, expectedRevision: number, mutationId: string = randomUUID()) {
    validateResumeId(id); validateRevision(expectedRevision); validateMutationId(mutationId);
    const deleted = await this.request<{ revision: number }>(encodeURIComponent(id), "DELETE", { expectedRevision, mutationId });
    return { id, ...deleted, mutationId, deleted: true };
  }
  async editItem(id: string, expectedRevision: number, operation: unknown, mutationId: string = randomUUID()) {
    validateResumeId(id); validateRevision(expectedRevision); validateMutationId(mutationId); assertJSON(operation);
    return projectResume(await this.request<StoredResume>(`${encodeURIComponent(id)}/items`, "POST", { operation, expectedRevision, mutationId }));
  }
  history(id: string, limit = 25, before?: number) {
    validateResumeId(id);
    return this.request<any>(`${encodeURIComponent(id)}/history?limit=${limit}${before === undefined ? "" : `&before=${before}`}`);
  }
  private rawVersion(id: string, version: number) {
    validateResumeId(id); validateRevision(version);
    return this.request<StoredResume & { deleted: boolean; action: string; source: string }>(`${encodeURIComponent(id)}/history?version=${version}`);
  }
  async version(id: string, version: number, includeImages = false) {
    const record = await this.rawVersion(id, version);
    const { resume, ...metadata } = record;
    return { ...metadata, ...projectResume(record, { includeImages }) };
  }
  async diff(id: string, from: number, to: number) {
    const [a, b] = await Promise.all([this.rawVersion(id, from), this.rawVersion(id, to)]);
    const changedFields: string[] = [];
    const compare = (a: any, b: any, path: string) => {
      if (path === "basic.githubKey" || path === "updatedAt") return;
      if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], path ? `${path}.${key}` : key);
      } else if (JSON.stringify(a) !== JSON.stringify(b)) changedFields.push(path);
    };
    compare(a.resume, b.resume, "");
    if (a.deleted !== b.deleted) changedFields.push("deleted");
    return { id, fromRevision: from, toRevision: to, changedFields };
  }
  deleted() { return this.request<any>("?deleted=1"); }
  async restore(id: string, targetRevision: number, expectedRevision: number, mutationId: string = randomUUID()) {
    validateResumeId(id); validateRevision(targetRevision); validateRevision(expectedRevision); validateMutationId(mutationId);
    return projectResume(await this.request<StoredResume>(`${encodeURIComponent(id)}/restore`, "POST", { targetRevision, expectedRevision, mutationId }));
  }
  aiList() { return this.request<any>("", "GET", undefined, true); }
  aiProviders() { return this.request<any>("?providers=1", "GET", undefined, true); }
  aiChange(operation: Record<string, unknown>, expectedRevision: number, storageId: string, mutationId: string = randomUUID()) {
    assertJSON(operation); validateRevision(expectedRevision); validateMutationId(mutationId);
    return this.request<any>("", "POST", { ...operation, expectedRevision, storageId, mutationId }, true);
  }
  aiTest(modelId: string, kind: "text" | "pdf" = "text") { return this.request<any>("", "POST", { action: "test", modelId, kind }, true); }
  aiDiscover(modelId: string) { return this.request<any>("", "POST", { action: "discover", modelId }, true); }

}
