import { blankResumeState } from "../config/initialResumeData";
import { normalizeResumeDocument } from "./resume-storage-contract";
import type { ResumeData } from "../types/resume";
import type { StoredResume } from "./resume-storage-contract";

export class AgentError extends Error {
  resumeId?: string;
  constructor(public code: string, message: string, public status = 400, public current?: StoredResume | null, public mutationId?: string) { super(message); }
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
export function mergeJSONPatch(target: unknown, patch: unknown): unknown {
  if (!object(patch)) return structuredClone(patch);
  const result: Record<string, unknown> = object(target) ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key]; else result[key] = mergeJSONPatch(result[key], value);
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
  return validateAgentResume(normalizeResumeDocument(mergeJSONPatch(resume, prepared)));
}
