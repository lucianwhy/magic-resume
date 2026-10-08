import { randomInt } from "node:crypto";
import { AI_PROVIDER_DEFINITIONS, BUILTIN_AI_MODELS, type AIModelProfile, canModelParsePdf, isModelConfigured } from "../../config/ai-models";
import { projectAISettings } from "../ai-settings-operations";
import { AgentError } from "../resume-edit";
import { ResumeStorageError } from "../resume-storage-contract";
import { getDatabase } from "./database";
import { guardResumeRequest, readStorageBody } from "./resume-storage-api";
import { WorkspaceRepository } from "./workspace-settings-api";
import { handleModelsRequest } from "./ai-models";
import { handleTextRequest } from "./ai-text";
import { handleResumeImport } from "./resume-import";

export async function handleAIControl(request: Request, repository?: WorkspaceRepository, fetcher: typeof fetch = fetch) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  try {
    guardResumeRequest(request);
    if (request.method === "GET" && new URL(request.url).searchParams.get("providers") === "1") return json({ providers: AI_PROVIDER_DEFINITIONS, builtinModels: BUILTIN_AI_MODELS });
    const repo = repository ?? new WorkspaceRepository(getDatabase());
    if (request.method === "GET") {
      const snapshot = await repo.list();
      return json({ storageId: snapshot.storageId, revision: snapshot.entries.ai?.revision ?? 0, ...projectAISettings(snapshot.entries.ai?.value) });
    }
    if (request.method !== "POST") return json({ code: "methodNotAllowed" }, 405);
    const input = await readStorageBody(request);
    if (JSON.stringify(input).length > 1024 * 1024) throw new ResumeStorageError("settingsTooLarge", 413);
    if (["upsert", "delete", "assign"].includes(input.action as string)) {
      const { expectedRevision, mutationId, storageId, ...operation } = input;
      const saved = await repo.mutateAI(operation, expectedRevision, mutationId, storageId);
      return json({ storageId, revision: saved.revision, ...projectAISettings(saved.value) });
    }
    if (input.action !== "test" && input.action !== "discover") throw new AgentError("invalidAIOperation", "Unknown action.");
    const snapshot = await repo.list();
    const model: AIModelProfile | undefined = snapshot.entries.ai?.value.models.find((model: { id: string }) => model.id === input.modelId);
    if (!model) throw new AgentError("modelNotFound", "Model profile does not exist.", 404);
    if (!isModelConfigured(model)) throw new AgentError("modelNotConfigured", "Configure the model before testing.");
    const internal = (body: unknown) => new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.signal });
    let response: Response;
    if (input.action === "discover") response = await handleModelsRequest(internal(model), fetcher);
    else if (input.kind === "pdf") {
      if (!canModelParsePdf(model)) throw new AgentError("modelDoesNotSupportPdf", "Choose a vision model.");
      const digits = String(randomInt(100000, 1000000));
      const { default: sharp } = await import("sharp");
      const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><rect width="400" height="120" fill="white"/><text x="200" y="80" text-anchor="middle" font-family="sans-serif" font-size="56" fill="black">${digits}</text></svg>`)).png().toBuffer();
      response = await handleResumeImport(internal({ ...model, images: [`data:image/png;base64,${png.toString("base64")}`], test: true }), fetcher);
      const data = await response.json();
      if (!response.ok) return json({ code: data.code ?? "visionTestFailed" }, response.status);
      return data.code === digits ? json({ ok: true, modelId: model.id, kind: "pdf" }) : json({ code: "visionTestFailed" }, 502);
    } else {
      if (input.kind !== undefined && input.kind !== "text") throw new AgentError("invalidTestKind", "Test kind must be text or pdf.");
      response = await handleTextRequest(internal({ connection: model }), "test", fetcher);
    }
    // Upstream responses are untrusted, including model descriptions.
    const secrets = [...new Set([model.apiKey, model.apiKey.trim()])].filter(Boolean);
    const redact = (value: any): any => {
      if (typeof value === "string") return secrets.reduce((text, key) => text.split(key).join("[redacted]"), value);
      if (Array.isArray(value)) return value.map(redact);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [redact(key), redact(child)]));
      return value;
    };
    const data = redact(await response.json());
    return json(data, response.status);
  } catch (error) {
    if (error instanceof ResumeStorageError || error instanceof AgentError) return json({ code: error.code }, error.status);
    console.error("[ai-control] Request failed");
    return json({ code: "requestFailed" }, 503);
  }
}
