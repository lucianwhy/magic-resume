import { createFileRoute } from "@tanstack/react-router";
import {
  ResumeVaultError,
  listResumes,
  readJsonBody,
  requireResumeApiKey,
  saveResume,
} from "@/lib/server/resumeVault";

const errorResponse = (error: unknown) => {
  if (error instanceof ResumeVaultError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Resume API error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
};

export const Route = createFileRoute("/api/resumes/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          requireResumeApiKey(request);
          return Response.json({ resumes: await listResumes() });
        } catch (error) {
          return errorResponse(error);
        }
      },
      POST: async ({ request }) => {
        try {
          requireResumeApiKey(request);
          const body = await readJsonBody(request);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new ResumeVaultError(400, "Resume must be a JSON object");
          }
          const id = (body as { id?: unknown }).id;
          if (typeof id !== "string") {
            throw new ResumeVaultError(400, "Resume body must include string id");
          }
          return Response.json({ resume: await saveResume(id, body) }, { status: 201 });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
