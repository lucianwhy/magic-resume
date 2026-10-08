import { getDatabase } from "./database";
import { ResumeRepository } from "./resume-repository";
import { guardResumeRequest, readStorageBody, requestClient } from "./resume-storage-api";
import { ResumeStorageError } from "../resume-storage-contract";
import { AgentError } from "../resume-edit";

export async function handleResumeAction(request: Request, id: string, action: string, repository?: ResumeRepository) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  try {
    guardResumeRequest(request);
    const repo = repository ?? new ResumeRepository(getDatabase(), requestClient(request));
    if (request.method === "GET" && action === "history") {
      const query = new URL(request.url).searchParams;
      if (query.has("version")) return json(await repo.version(id, Number(query.get("version"))));
      return json(await repo.history(id, query.has("limit") ? Number(query.get("limit")) : 25, query.has("before") ? Number(query.get("before")) : undefined));
    }
    if (request.method === "POST") {
      const input = await readStorageBody(request);
      if (action === "items") return json(await repo.editItems(id, input.operation, input.expectedRevision, input.mutationId));
      if (action === "restore") return json(await repo.restore(id, input.targetRevision, input.expectedRevision, input.mutationId));
    }
    return json({ code: "methodNotAllowed" }, 405);
  } catch (error) {
    if (error instanceof ResumeStorageError || error instanceof AgentError) return json({ code: error.code, ...(error.current !== undefined ? { current: error.current } : {}) }, error.status);
    console.error("[resume-actions] Request failed");
    return json({ code: "databaseUnavailable" }, 503);
  }
}
