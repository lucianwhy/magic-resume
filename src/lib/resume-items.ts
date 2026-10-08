import { AgentError, assertJSON, mergeJSONPatch, patchResume } from "./resume-edit";
import type { ResumeData } from "../types/resume";

export interface ItemOperation {
  section: string;
  action: "add" | "update" | "remove" | "reorder";
  itemId?: string;
  item?: Record<string, unknown>;
  itemIds?: string[];
}
const defaults: Record<string, Record<string, unknown>> = {
  education: { school: "", major: "", degree: "", startDate: "", endDate: "", description: "", visible: true },
  experience: { company: "", position: "", date: "", details: "", visible: true },
  projects: { name: "", role: "", date: "", description: "", visible: true },
  certificates: { width: 50 },
  menuSections: { title: "", icon: "", enabled: true },
  "basic.customFields": { label: "", value: "", visible: true, custom: true, displayLabel: true },
  "basic.fieldOrder": { label: "", type: "text", visible: true },
  customData: { title: "", subtitle: "", dateRange: "", description: "", visible: true },
};
export function applyItemOperation(resume: ResumeData, input: unknown, uuid: () => string): ResumeData {
  assertJSON(input);
  const op = input as ItemOperation;
  if (!op || typeof op !== "object" || Array.isArray(op) || Object.keys(op).some(k => !["section", "action", "itemId", "item", "itemIds"].includes(k))) throw new AgentError("invalidItemOperation", "Invalid item operation.");
  const custom = typeof op.section === "string" && /^customData\.[a-zA-Z0-9_-]{1,128}$/.test(op.section);
  if (!Object.hasOwn(defaults, op.section) && !custom) throw new AgentError("invalidItemSection", "Unknown item section.");
  const [root, nested] = op.section.split(".");
  const value = nested ? (resume as any)[root]?.[nested] : (resume as any)[root];
  if (value !== undefined && !Array.isArray(value)) throw new AgentError("invalidItemSection", "Section is not an item array.");
  let items: Record<string, any>[] = structuredClone(value ?? []);
  if (op.action === "add" || op.action === "update") {
    if (!op.item || typeof op.item !== "object" || Array.isArray(op.item)) throw new AgentError("invalidItemOperation", "Provide an item object.");
    if (op.action === "add") {
      const id = op.item.id ?? uuid();
      if (typeof id !== "string" || !id || id.length > 128 || items.some(item => item.id === id)) throw new AgentError("duplicateItemId", "New item needs a unique id.");
      items.push({ ...defaults[custom ? "customData" : op.section], ...(root === "menuSections" ? { order: items.length } : {}), ...op.item, id });
    } else {
      const index = items.findIndex(item => item.id === op.itemId);
      if (index < 0) throw new AgentError("itemNotFound", "Item does not exist.", 404);
      if (Object.hasOwn(op.item, "id")) throw new AgentError("invalidItemOperation", "An update cannot change the item id.");
      items[index] = mergeJSONPatch(items[index], op.item) as Record<string, any>;
    }
  } else if (op.action === "remove") {
    if (!items.some(item => item.id === op.itemId)) throw new AgentError("itemNotFound", "Item does not exist.", 404);
    items = items.filter(item => item.id !== op.itemId);
  } else if (op.action === "reorder") {
    if (!Array.isArray(op.itemIds) || op.itemIds.length !== items.length || new Set(op.itemIds).size !== items.length || op.itemIds.some(id => !items.some(item => item.id === id))) throw new AgentError("invalidItemOrder", "Provide every existing item id exactly once.");
    items = op.itemIds.map(id => items.find(item => item.id === id)!);
  } else throw new AgentError("invalidItemOperation", "Unknown item action.");
  if (root === "menuSections" && ["add", "remove", "reorder"].includes(op.action)) items = items.map((item, order) => ({ ...item, order }));
  if (op.section === "basic.fieldOrder" && items.some(item => typeof item.key !== "string" || !Object.hasOwn(resume.basic, item.key))) throw new AgentError("invalidItemOperation", "Basic field order requires valid basic field keys.");
  return patchResume(resume, nested ? { [root]: { [nested]: items } } : { [root]: items });
}
