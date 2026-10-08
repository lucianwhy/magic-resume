import { createFileRoute } from "@tanstack/react-router";
import { handleResumeAction } from "@/lib/server/resume-actions-api";
export const Route = createFileRoute("/api/resumes/$id/$action")({ server: { handlers: {
  GET: ({ request, params }) => handleResumeAction(request, params.id, params.action),
  POST: ({ request, params }) => handleResumeAction(request, params.id, params.action),
} } });
