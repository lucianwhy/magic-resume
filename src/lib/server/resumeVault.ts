import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";

export type ResumeDocument = Record<string, unknown> & {
  id: string;
  updatedAt?: string;
};

const DEFAULT_DATA_DIR = ".data/resumes";
const MAX_BODY_BYTES = 1024 * 1024;
const RESUME_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

const dataDirectory = () =>
  resolve(process.env.RESUME_DATA_DIR || DEFAULT_DATA_DIR);

const assertResumeId = (id: string) => {
  if (!RESUME_ID.test(id)) {
    throw new ResumeVaultError(400, "Invalid resume id");
  }
};

const documentPath = (id: string) => {
  assertResumeId(id);
  return join(dataDirectory(), `${id}.json`);
};

export class ResumeVaultError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export const requireResumeApiKey = (request: Request) => {
  const expected = process.env.RESUME_API_KEY;
  if (!expected) {
    throw new ResumeVaultError(503, "RESUME_API_KEY is not configured");
  }

  const authorization = request.headers.get("authorization");
  const supplied = authorization?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-api-key");

  const matches = matchesSecret(supplied, expected);

  if (!matches) {
    throw new ResumeVaultError(401, "Invalid API key");
  }
};

const matchesSecret = (supplied: string | null | undefined, expected: string) => {
  const suppliedBuffer = Buffer.from(supplied || "");
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer);
};

export const requireResumeBootstrapToken = (request: Request) => {
  const expected = process.env.RESUME_BOOTSTRAP_TOKEN;
  if (!expected) {
    throw new ResumeVaultError(503, "RESUME_BOOTSTRAP_TOKEN is not configured");
  }

  if (!matchesSecret(request.headers.get("x-resume-bootstrap-token"), expected)) {
    throw new ResumeVaultError(401, "Invalid bootstrap token");
  }
};

export const requireBootstrapResumeId = (id: string) => {
  if (!process.env.RESUME_DEFAULT_ID || id !== process.env.RESUME_DEFAULT_ID) {
    throw new ResumeVaultError(404, "Resume not found");
  }
};

export const readJsonBody = async (request: Request): Promise<unknown> => {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) {
    throw new ResumeVaultError(413, "Request body is too large");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ResumeVaultError(413, "Request body is too large");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ResumeVaultError(400, "Request body must be valid JSON");
  }
};

const asDocument = (value: unknown, id: string): ResumeDocument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ResumeVaultError(400, "Resume must be a JSON object");
  }

  const document = value as Record<string, unknown>;
  if (typeof document.id !== "string" || document.id !== id) {
    throw new ResumeVaultError(400, "Resume body id must match URL id");
  }

  return document as ResumeDocument;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const mergeDocument = (
  target: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id" || key === "createdAt") continue;
    next[key] = isPlainObject(value) && isPlainObject(next[key])
      ? mergeDocument(next[key], value)
      : value;
  }
  return next;
};

export const listResumes = async () => {
  const directory = dataDirectory();
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .filter((id) => RESUME_ID.test(id));
};

export const getResume = async (id: string): Promise<ResumeDocument> => {
  try {
    return JSON.parse(await readFile(documentPath(id), "utf8")) as ResumeDocument;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new ResumeVaultError(404, "Resume not found");
    }
    if (error instanceof SyntaxError) {
      throw new ResumeVaultError(500, "Stored resume JSON is invalid");
    }
    throw error;
  }
};

export const saveResume = async (id: string, value: unknown) => {
  const resume = asDocument(value, id);
  const filePath = documentPath(id);
  await mkdir(dirname(filePath), { recursive: true });
  const now = new Date().toISOString();
  const updated = { ...resume, updatedAt: now };
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
  return updated;
};

export const patchResume = async (id: string, value: unknown) => {
  if (!isPlainObject(value)) {
    throw new ResumeVaultError(400, "Patch must be a JSON object");
  }
  const current = await getResume(id);
  return saveResume(id, mergeDocument(current, value));
};

export const deleteResume = async (id: string) => {
  try {
    await rm(documentPath(id));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new ResumeVaultError(404, "Resume not found");
    }
    throw error;
  }
};
