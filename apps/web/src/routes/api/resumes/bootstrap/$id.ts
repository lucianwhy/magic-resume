import { createFileRoute } from "@tanstack/react-router";
import {
  ResumeVaultError,
  getResume,
  requireBootstrapResumeId,
  requireResumeBootstrapToken,
} from "@/lib/server/resumeVault";

const errorResponse = (error: unknown) => {
  if (error instanceof ResumeVaultError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Resume bootstrap error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
};

export const Route = createFileRoute("/api/resumes/bootstrap/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          requireResumeBootstrapToken(request);
          requireBootstrapResumeId(params.id);
          return Response.json({ resume: await getResume(params.id) });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
