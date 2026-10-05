import { randomUUID } from "node:crypto";
import { blankResumeState, blankResumeStateEn } from "../config/initialResumeData";
import { normalizeResumeDocument, validateMutationId, validateResumeId, validateRevision } from "../lib/resume-storage-contract";
import type { ResumeData } from "../types/resume";
import type { ResumeSnapshot, StoredResume } from "../lib/resume-storage-contract";

export const DEFAULT_API_URL = "http://127.0.0.1:3000";
export const SECTIONS = ["basic", "education", "experience", "projects", "certificates", "customData", "skillContent", "selfEvaluationContent", "menuSections", "globalSettings"] as const;
export type Section = typeof SECTIONS[number];
export class AgentError extends Error {
  resumeId?: string;
  constructor(public code: string, message: string, public status = 400, public current?: StoredResume | null, public mutationId?: string) { super(message); }
}

export function apiURL(value = process.env.MAGIC_RESUME_API_URL ?? DEFAULT_API_URL): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new AgentError("invalidAPIURL", "API URL must be a local HTTP origin."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new AgentError("invalidAPIURL", "Use a local HTTP origin, for example http://127.0.0.1:3000.");
  }
  return url.origin;
}

const forbidden = new Set(["__proto__", "prototype", "constructor"]);
export function assertJSON(value: unknown, depth = 0, budget = { remaining: 20000 }): void {
  if (++depth > 32 || --budget.remaining < 0) throw new AgentError("invalidPatch", "JSON is too deeply nested or has too many fields.");
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) assertJSON(item, depth, budget); return; }
  if (!value || typeof value !== "object") throw new AgentError("invalidPatch", "Only JSON values are accepted.");
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new AgentError("invalidPatch", "Prototype keys are not accepted.");
    assertJSON(child, depth, budget);
  }
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function merge(target: unknown, patch: unknown): unknown {
  if (!object(patch)) return structuredClone(patch);
  const result: Record<string, unknown> = object(target) ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key]; else result[key] = merge(result[key], value);
  }
  return result;
}

function validateFields(value: Record<string, unknown>, schema: Record<string, string>) {
  for (const [key, type] of Object.entries(schema)) {
    if (value[key] !== undefined && (typeof value[key] !== type || type === "number" && (!Number.isFinite(value[key]) || (value[key] as number) < 0))) {
      throw new AgentError("invalidResumeField", `Invalid field type: ${key} must be ${type}.`);
    }
  }
}
export function validateAgentResume(resume: ResumeData): ResumeData {
  assertJSON(resume);
  validateFields(resume.basic as unknown as Record<string, unknown>, { githubContributionsVisible: "boolean", layout: "string" });
  validateFields(resume.basic.photoConfig as unknown as Record<string, unknown>, { width: "number", height: "number", customBorderRadius: "number", visible: "boolean", aspectRatio: "string", borderRadius: "string" });
  for (const icon of Object.values(resume.basic.icons)) if (typeof icon !== "string") throw new AgentError("invalidResumeField", "Basic icons must be strings.");
  const arrays: [unknown[], Record<string, string>][] = [
    [resume.basic.customFields, { label: "string", value: "string", icon: "string", visible: "boolean", custom: "boolean", displayLabel: "boolean" }],
    [resume.basic.fieldOrder ?? [], { key: "string", label: "string", type: "string", visible: "boolean", custom: "boolean" }],
    [resume.education, { school: "string", major: "string", degree: "string", startDate: "string", endDate: "string", gpa: "string", description: "string", visible: "boolean" }],
    [resume.experience, { company: "string", position: "string", date: "string", details: "string", visible: "boolean" }],
    [resume.projects, { name: "string", role: "string", date: "string", description: "string", link: "string", linkLabel: "string", visible: "boolean" }],
    [resume.certificates, { url: "string", width: "number" }],
    [resume.menuSections, { title: "string", icon: "string", enabled: "boolean", order: "number" }],
    ...Object.values(resume.customData).map(items => [items, { title: "string", subtitle: "string", dateRange: "string", description: "string", visible: "boolean" }] as [unknown[], Record<string, string>]),
  ];
  for (const [items, fields] of arrays) {
    if (!Array.isArray(items)) throw new AgentError("invalidResumeField", "Section items must be arrays.");
    const ids = new Set<string>();
    for (const item of items) {
      if (!object(item) || typeof item.id !== "string" || !item.id || ids.has(item.id)) throw new AgentError("invalidResumeField", "Each section item needs a unique string id.");
      ids.add(item.id); validateFields(item, fields);
    }
  }
  validateFields(resume.globalSettings as Record<string, unknown>, {
    themeColor: "string", fontFamily: "string", baseFontSize: "number", pagePadding: "number", paragraphSpacing: "number", lineHeight: "number", sectionSpacing: "number", headerSize: "number", subheaderSize: "number",
    useIconMode: "boolean", centerSubtitle: "boolean", flexibleHeaderLayout: "boolean", autoOnePage: "boolean",
  });
  return resume;
}
export function patchResume(resume: ResumeData, patch: unknown): ResumeData {
  if (!object(patch) || !Object.keys(patch).length) throw new AgentError("invalidPatch", "Provide a non-empty JSON object patch.");
  assertJSON(patch);
  const allowed = new Set([...Object.keys(blankResumeState), "templateId"]);
  for (const key of Object.keys(patch)) if (!allowed.has(key) || ["id", "createdAt", "updatedAt"].includes(key)) throw new AgentError("invalidPatch", `Cannot patch field: ${key}.`);
  const prepared = { ...patch };
  // Reads omit certificate image URLs. Replacing an array must not erase an
  // existing image just because the agent never received that large field.
  if (Array.isArray(prepared.certificates)) {
    const existing = new Map(resume.certificates.map(item => [item.id, item.url]));
    const certificates = prepared.certificates.map(item => object(item) && typeof item.id === "string" && !Object.hasOwn(item, "url") && existing.has(item.id)
      ? { ...item, url: existing.get(item.id) } : item);
    if (certificates.some(item => !object(item) || typeof item.url !== "string")) throw new AgentError("invalidResumeField", "New certificates need a URL; existing omitted URLs are preserved by id.");
    prepared.certificates = certificates;
  }
  return validateAgentResume(normalizeResumeDocument(merge(resume, prepared)));
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
  constructor(origin?: string) { this.origin = apiURL(origin); }
  private async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const mutationId = object(body) && typeof body.mutationId === "string" ? body.mutationId : undefined;
    try {
      const response = await fetch(`${this.origin}/api/resumes/${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(30000),
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
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
}
