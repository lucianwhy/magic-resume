import { createFileRoute } from "@tanstack/react-router";
import { handleWorkspaceSettings } from "@/lib/server/workspace-settings-api";
export const Route = createFileRoute("/api/workspace/")({ server: { handlers: {
  GET: ({ request }) => handleWorkspaceSettings(request),
  POST: ({ request }) => handleWorkspaceSettings(request),
} } });
