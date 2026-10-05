import { useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { useWorkspaceSettings } from "@/lib/workspace-settings-client";

export function WorkspacePreferences() {
  const preferences = useWorkspaceSettings(state => state.snapshot?.entries.preferences?.value);
  const { setTheme } = useTheme();
  useEffect(() => {
    if (preferences?.theme) setTheme(preferences.theme);
  }, [preferences?.theme, setTheme]);
  return null;
}
