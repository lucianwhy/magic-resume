import { createFileRoute } from "@tanstack/react-router";
import { handleResumeStorage } from "@/lib/server/resume-storage-api";

export const Route = createFileRoute("/api/resumes/")({
  server: { handlers: {
    GET: ({ request }) => handleResumeStorage(request),
    POST: ({ request }) => handleResumeStorage(request),
  } },
});
