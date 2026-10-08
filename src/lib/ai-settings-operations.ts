import { AI_PROVIDER_DEFINITIONS, AI_PROVIDERS, canModelParsePdf, createModelProfile, isModelConfigured, modelSupportsPdf, type AIProvider } from "../config/ai-models";
import { migrateAISettings } from "../store/ai-config-migration";
import { normalizeWorkspaceValue } from "./workspace-settings-contract";
import { AgentError, assertJSON } from "./resume-edit";

export function applyAIOperation(value: unknown, input: unknown, uuid: () => string) {
  assertJSON(input);
  const op = input as Record<string, any>;
  if (!op || typeof op !== "object" || Array.isArray(op) || Object.keys(op).some(key => !["action", "profile", "modelId", "task"].includes(key))) throw new AgentError("invalidAIOperation", "Invalid AI configuration operation.");
  const state = migrateAISettings(value);
  if (op.action === "upsert") {
    const profile = op.profile;
    if (!profile || typeof profile !== "object" || Array.isArray(profile) || Object.keys(profile).some(key => !["id", "provider", "name", "protocol", "model", "baseUrl", "apiKey", "supportsPdf"].includes(key))) throw new AgentError("invalidAIProfile", "Provide a model profile.");
    if (profile.id !== undefined && (typeof profile.id !== "string" || !profile.id || profile.id.length > 128)) throw new AgentError("invalidAIProfile", "Invalid model profile id.");
    for (const [field, value] of Object.entries(profile)) {
      if (typeof value !== (field === "supportsPdf" ? "boolean" : "string")) throw new AgentError("invalidAIProfile", "Invalid profile field type.");
    }
    const existing = state.models.find(model => model.id === profile.id);
    const provider = profile.provider ?? existing?.provider;
    if (!AI_PROVIDERS.includes(provider)) throw new AgentError("invalidProvider", "Choose a supported provider.");
    const next = { ...(existing ?? createModelProfile(provider, profile.id ?? uuid())), ...profile, provider };
    if (existing && provider !== existing.provider && profile.protocol === undefined) next.protocol = AI_PROVIDER_DEFINITIONS[provider as AIProvider].protocol;
    if (profile.supportsPdf === undefined && (!existing || profile.model !== undefined || provider !== existing.provider)) next.supportsPdf = modelSupportsPdf(provider, next.model);
    if (typeof next.supportsPdf !== "boolean") throw new AgentError("invalidAIProfile", "supportsPdf must be boolean.");
    if (existing) state.models = state.models.map(model => model.id === existing.id ? next : model); else state.models.push(next);
    // Editing a model cannot leave an unusable PDF assignment behind.
    if (state.pdfModelId === next.id && !canModelParsePdf(next)) state.pdfModelId = null;
  } else if (op.action === "delete") {
    if (!state.models.some(model => model.id === op.modelId)) throw new AgentError("modelNotFound", "Model profile does not exist.", 404);
    state.models = state.models.filter(model => model.id !== op.modelId);
    if (state.textModelId === op.modelId) state.textModelId = null;
    if (state.pdfModelId === op.modelId) state.pdfModelId = null;
  } else if (op.action === "assign") {
    if (!["text", "pdf"].includes(op.task)) throw new AgentError("invalidTask", "Task must be text or pdf.");
    if (op.modelId !== null) {
      const model = state.models.find(model => model.id === op.modelId);
      if (!model) throw new AgentError("modelNotFound", "Model profile does not exist.", 404);
      if (!isModelConfigured(model)) throw new AgentError("modelNotConfigured", "Configure the model before assigning it.");
      if (op.task === "pdf" && !canModelParsePdf(model)) throw new AgentError("modelDoesNotSupportPdf", "Choose a vision model for PDF parsing.");
    }
    if (op.task === "text") state.textModelId = op.modelId; else state.pdfModelId = op.modelId;
  } else throw new AgentError("invalidAIOperation", "Unknown AI configuration action.");
  return normalizeWorkspaceValue("ai", state);
}
export function projectAISettings(value: unknown) {
  const state = migrateAISettings(value);
  return { ...state, models: state.models.map(({ apiKey, ...model }) => ({ ...model, hasApiKey: !!apiKey, configured: isModelConfigured({ ...model, apiKey }) })) };
}
