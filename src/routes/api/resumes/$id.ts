import { createFileRoute } from "@tanstack/react-router";
import { handleResumeStorage } from "@/lib/server/resume-storage-api";

export const Route = createFileRoute("/api/resumes/$id")({
  server: { handlers: {
    GET: ({ request, params }) => handleResumeStorage(request, params.id),
    PUT: ({ request, params }) => handleResumeStorage(request, params.id),
    DELETE: ({ request, params }) => handleResumeStorage(request, params.id),
  } },
});
