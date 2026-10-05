import { useAIConfigStore } from "@/store/useAIConfigStore";
import { migrateAISettings } from "@/store/ai-config-migration";
import { clearLegacyDirectoryStorage, getFileHandle, readLegacyDirectoryConfig } from "@/utils/fileSystem";
import { initializeWorkspaceSettings, saveWorkspaceValue, useWorkspaceSettings } from "./workspace-settings-client";

let applying = false, subscription: (() => void) | undefined;
const readLocal = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
async function legacySettings(): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = {};
  const raw = readLocal("ai-config-storage");
  if (raw) {
    let input;
    try { input = JSON.parse(raw); } catch { throw new Error("invalidLegacySettings"); }
    const state = input?.state ?? input;
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("invalidLegacySettings");
    if (Array.isArray(state.models)) {
      for (const model of state.models) {
        if (!model || typeof model !== "object" || ["id", "apiKey", "model", "baseUrl"].some(field => typeof model[field] !== "string")) throw new Error("invalidLegacySettings");
      }
    } else {
      for (const [key, value] of Object.entries(state)) {
        if (/ApiKey$/.test(key) && typeof value !== "string") throw new Error("invalidLegacySettings");
      }
    }
    const ai = migrateAISettings(state);
    if (Array.isArray(state.models) && state.models.length !== ai.models.length) throw new Error("invalidLegacySettings");
    if (ai.models.length) values.ai = ai;
  }
  const preferences: Record<string, unknown> = {};
  const theme = readLocal("magic-resume-theme"), active = readLocal("resume-db-active-id");
  const locale = document.cookie.split("; ").find(row => row.startsWith("NEXT_LOCALE="))?.split("=")[1];
  const sidebar = document.cookie.split("; ").find(row => row.startsWith("sidebar:state="))?.split("=")[1];
  if (theme && ["light", "dark", "system"].includes(theme)) preferences.theme = theme;
  if (locale && ["zh", "en"].includes(locale)) preferences.locale = locale;
  if (active) preferences.activeResumeId = active;
  if (sidebar === "true" || sidebar === "false") preferences.sidebarOpen = sidebar === "true";
  if (Object.keys(preferences).length) values.preferences = preferences;
  try {
    const directoryName = await readLegacyDirectoryConfig();
    if (directoryName) {
      const handle = await getFileHandle("syncDirectory");
      values["file-sync"] = { directoryName, configured: !!handle, mode: "readwrite" };
    }
  } catch { /* Browsers without IndexedDB still support database storage. */ }
  return values;
}
export async function initializeWorkspaceDatabase() {
  await initializeWorkspaceSettings(legacySettings);
  // The transactional database import ledger retains the migrated credentials.
  // Stop keeping their former browser copy after the import is confirmed.
  for (const key of ["ai-config-storage", "magic-resume-theme", "resume-db-active-id"]) {
    try { localStorage.removeItem(key); } catch { /* Restricted storage must not block database use. */ }
  }
  for (const name of ["NEXT_LOCALE", "sidebar:state"]) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }
  try { await clearLegacyDirectoryStorage(); } catch {
    useWorkspaceSettings.setState({ phase: "error", error: "legacyDirectoryStorageBlocked" });
    throw new Error("legacyDirectoryStorageBlocked");
  }
  useWorkspaceSettings.setState({ phase: "ready", error: null });
  if (subscription) return;
  const applyAI = () => {
    const ai = migrateAISettings(useWorkspaceSettings.getState().snapshot?.entries.ai?.value);
    if (JSON.stringify(ai) !== JSON.stringify(selectAI())) {
      applying = true; useAIConfigStore.setState(ai); applying = false;
    }
  };
  const selectAI = () => { const { models, textModelId, pdfModelId } = useAIConfigStore.getState(); return { models, textModelId, pdfModelId }; };
  applyAI();
  const offAI = useAIConfigStore.subscribe(() => { if (!applying) saveWorkspaceValue("ai", selectAI()); });
  const offSettings = useWorkspaceSettings.subscribe(() => applyAI());
  subscription = () => { offAI(); offSettings(); };
}
if (import.meta.hot) import.meta.hot.dispose(() => { subscription?.(); subscription = undefined; });
