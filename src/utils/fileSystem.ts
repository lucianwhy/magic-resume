import { saveWorkspaceValue, settingsValue, flushWorkspaceSettings } from "@/lib/workspace-settings-client";

// A browser grant is a runtime capability, never a database credential.
const handles = new Map<string, FileSystemHandle>();
const LEGACY_DB = "FileHandleDB";
let legacyRead: Promise<string | null> | undefined;
let legacyPresent = false;

export const storeFileHandle = async (key: string, handle: FileSystemHandle | null): Promise<void> => {
  if (handle) handles.set(key, handle); else handles.delete(key);
  if (key === "syncDirectory") {
    saveWorkspaceValue("file-sync", { directoryName: handle?.name ?? "", configured: !!handle, mode: "readwrite", ...(handle ? { authorizedAt: new Date().toISOString() } : {}) });
    await flushWorkspaceSettings();
  }
};

export const getFileHandle = async (key: string): Promise<FileSystemHandle | null> => {
  const handle = handles.get(key) ?? null;
  const config = settingsValue("file-sync");
  return key === "syncDirectory" && "configured" in config && (!config.configured || handle?.name !== config.directoryName) ? null : handle;
};

export const storeConfig = async (key: string, value: unknown): Promise<void> => {
  if (key !== "syncDirectoryPath" || typeof value !== "string") throw new Error("Unsupported directory setting");
  saveWorkspaceValue("file-sync", { ...settingsValue("file-sync"), directoryName: value, configured: !!value, mode: "readwrite" });
  await flushWorkspaceSettings();
};

export const getConfig = async (key: string): Promise<string | null> => {
  return key === "syncDirectoryPath" ? settingsValue("file-sync").directoryName ?? "" : null;
};

// Read the previous IndexedDB exactly once for migration. Fresh installations
// never create an IndexedDB database, including in browsers without databases().
export const readLegacyDirectoryConfig = (): Promise<string | null> => {
  if (legacyRead) return legacyRead;
  legacyRead = (async () => {
    if (typeof indexedDB === "undefined") return null;
    if (indexedDB.databases && !(await indexedDB.databases()).some(db => db.name === LEGACY_DB)) return null;
    return new Promise<string | null>((resolve, reject) => {
      let absent = false;
      const request = indexedDB.open(LEGACY_DB);
      request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
      request.onerror = () => absent ? resolve(null) : reject(request.error);
      request.onsuccess = () => {
        legacyPresent = true;
        const db = request.result;
        const stores = ["handles", "config"].filter(name => db.objectStoreNames.contains(name));
        if (!stores.length) { db.close(); resolve(null); return; }
        let directory: string | null = null;
        const transaction = db.transaction(stores, "readonly");
        if (stores.includes("config")) {
          const config = transaction.objectStore("config").get("syncDirectoryPath");
          config.onsuccess = () => { if (typeof config.result === "string") directory = config.result; };
        }
        if (stores.includes("handles")) {
          const handle = transaction.objectStore("handles").get("syncDirectory");
          handle.onsuccess = () => { if (handle.result) { handles.set("syncDirectory", handle.result); directory ??= handle.result.name; } };
        }
        transaction.oncomplete = () => { db.close(); resolve(directory); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
      };
    });
  })();
  return legacyRead;
};

export const clearLegacyDirectoryStorage = async (): Promise<void> => {
  if (typeof indexedDB === "undefined" || !legacyPresent) return;
  // No connection stays open after the read transaction.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB);
    request.onsuccess = () => { legacyPresent = false; resolve(); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("legacyDirectoryStorageBlocked"));
  });
};

export const verifyPermission = async (
  handle: FileSystemHandle,
  mode: "read" | "readwrite" = "readwrite"
): Promise<boolean> => {
  if (!handle) {
    return false;
  }

  const options = { mode };

  // 检查当前权限
  const capability = handle as FileSystemHandle & {
    queryPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  };
  if ((await capability.queryPermission(options)) === "granted") {
    return true;
  }

  // 请求权限
  if ((await capability.requestPermission(options)) === "granted") {
    return true;
  }

  return false;
};
