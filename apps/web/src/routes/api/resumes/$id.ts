import { createFileRoute } from "@tanstack/react-router";
import {
  ResumeVaultError,
  deleteResume,
  getResume,
  patchResume,
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

export const Route = createFileRoute("/api/resumes/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          requireResumeApiKey(request);
          return Response.json({ resume: await getResume(params.id) });
        } catch (error) {
          return errorResponse(error);
        }
      },
      PUT: async ({ request, params }) => {
        try {
          requireResumeApiKey(request);
          return Response.json({ resume: await saveResume(params.id, await readJsonBody(request)) });
        } catch (error) {
          return errorResponse(error);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          requireResumeApiKey(request);
          return Response.json({ resume: await patchResume(params.id, await readJsonBody(request)) });
        } catch (error) {
          return errorResponse(error);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          requireResumeApiKey(request);
          await deleteResume(params.id);
          return new Response(null, { status: 204 });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
