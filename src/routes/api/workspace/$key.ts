import { createFileRoute } from "@tanstack/react-router";
import { handleWorkspaceSettings } from "@/lib/server/workspace-settings-api";
import type { WorkspaceKey } from "@/lib/workspace-settings-contract";
export const Route = createFileRoute("/api/workspace/$key")({ server: { handlers: {
  PUT: ({ request, params }) => handleWorkspaceSettings(request, params.key as WorkspaceKey),
} } });
