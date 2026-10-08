import { createFileRoute } from "@tanstack/react-router";
import { handleAIControl } from "@/lib/server/ai-control-api";
export const Route = createFileRoute("/api/workspace/ai-control")({ server: { handlers: {
  GET: ({ request }) => handleAIControl(request),
  POST: ({ request }) => handleAIControl(request),
} } });
