import { getDatabase } from "./database";
import { ResumeRepository } from "./resume-repository";
import { ResumeStorageError, validateResumeId } from "../resume-storage-contract";

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export const requestClient = (request: Request) => {
  const source = request.headers.get("X-Magic-Resume-Client");
  return source === "cli" || source === "mcp" ? source : "web";
};

export function guardResumeRequest(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new ResumeStorageError("localAccessOnly", 403);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw new ResumeStorageError("originNotAllowed", 403);
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") throw new ResumeStorageError("originNotAllowed", 403);
}

export async function readStorageBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new ResumeStorageError("jsonRequired", 415);
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) throw new ResumeStorageError("resumeTooLarge", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ResumeStorageError("invalidJSON");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new ResumeStorageError("resumeTooLarge", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw new ResumeStorageError("invalidJSON"); }
}

export async function handleResumeStorage(request: Request, id?: string, repository?: ResumeRepository): Promise<Response> {
  try {
    guardResumeRequest(request);
    const repo = repository ?? new ResumeRepository(getDatabase(), requestClient(request));
    if (id) validateResumeId(id);
    if (request.method === "GET") {
      if (id) return json(await repo.get(id));
      if (new URL(request.url).searchParams.get("deleted") === "1") return json(await repo.listDeleted());
      const version = await repo.snapshotVersion();
      if (request.headers.get("If-None-Match") === version) {
        return new Response(null, { status: 304, headers: { ETag: version, "Cache-Control": "no-store" } });
      }
      const response = json(await repo.list());
      response.headers.set("ETag", version);
      return response;
    }
    const input = await readStorageBody(request);
    if (request.method === "POST" && !id) return json(await repo.importLegacy(input.resumes));
    if (request.method === "PUT" && id) {
      if ((input.resume as { id?: unknown })?.id !== id) throw new ResumeStorageError("resumeIdMismatch");
      return json(await repo.put(input.resume, input.expectedRevision, input.mutationId));
    }
    if (request.method === "DELETE" && id) return json(await repo.delete(id, input.expectedRevision, input.mutationId));
    return json({ code: "methodNotAllowed" }, 405);
  } catch (error) {
    if (error instanceof ResumeStorageError) return json({ code: error.code, ...(error.current !== undefined ? { current: error.current } : {}) }, error.status);
    // Database errors can contain credentials or document data; do not echo them.
    console.error("[resume-storage] Database request failed");
    return json({ code: "databaseUnavailable" }, 503);
  }
}
