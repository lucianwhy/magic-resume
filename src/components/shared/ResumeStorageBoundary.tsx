import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { useLocale } from "@/i18n/compat/client";
import { useResumeDatabaseStatus } from "@/store/useResumeDatabaseStatus";
import { downloadResumeRecovery, initializeResumeDatabase, resolveResumeConflict, retryResumeDatabase } from "@/lib/resume-database-sync";
import { Button } from "@/components/ui/button";
import { initializeWorkspaceDatabase } from "@/lib/workspace-database-sync";
import { exportPendingSettings, flushWorkspaceSettings, reloadWorkspaceSettings, useWorkspaceSettings } from "@/lib/workspace-settings-client";
import { WorkspacePreferences } from "./WorkspacePreferences";

export function ResumeStorageBoundary({ children }: { children: React.ReactNode }) {
  const pathname = useLocation({ select: location => location.pathname });
  const enabled = pathname.startsWith("/app");
  const status = useResumeDatabaseStatus();
  const settings = useWorkspaceSettings();
  const en = useLocale() === "en";
  const [actionError, setActionError] = useState(false);
  const text = (zh: string, english: string) => en ? english : zh;

  const initialize = async () => {
    try { await initializeWorkspaceDatabase(); await initializeResumeDatabase(); } catch { /* Both stores expose their initialization errors. */ }
  };
  useEffect(() => { if (enabled) void initialize(); }, [enabled]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (useWorkspaceSettings.getState().pending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);
  if (!enabled) return <>{children}</>;
  if (status.phase !== "ready" || settings.phase !== "ready") return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-xl space-y-4 text-center" role={status.phase === "error" || settings.phase === "error" ? "alert" : "status"}>
        <h1 className="text-lg font-semibold">{status.phase === "error" || settings.phase === "error" ? text("暂时无法读取工作区", "Could not load workspace") : text("正在读取工作区…", "Loading workspace…")}</h1>
        {(status.phase === "error" || settings.phase === "error") && <>
          <p className="text-sm text-muted-foreground">{settings.error === "legacyDirectoryStorageBlocked" ? text("请关闭仍使用旧版本的其他页面，再重试清理目录授权存储。", "Close other pages using the old version, then retry clearing directory grants.") : text("请重试。未迁入数据库的旧数据仍保留，可先导出备份。", "Try again. Legacy data that has not been migrated is retained; you can export a backup.")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void initialize()}>{text("重试", "Retry")}</Button>
            <Button variant="outline" onClick={downloadResumeRecovery}>{text("导出备份", "Export backup")}</Button>
            {settings.phase === "error" && <Button variant="outline" onClick={exportPendingSettings}>{text("导出配置备份", "Export settings backup")}</Button>}
            {status.initializationError === "invalidLegacy" && <Button variant="outline" onClick={() => void initializeResumeDatabase(true)}>{text("暂不导入旧数据", "Skip legacy import")}</Button>}
          </div>
        </>}
      </div>
    </main>
  );

  const message = status.error === "databaseChanged" ? text("数据库已更换，请先导出未保存修改，再重新加载页面。", "The database changed. Export pending edits, then reload this page.")
    : status.conflicts.length ? text("检测到其他位置的修改，请处理版本冲突。", "Another editor changed these resumes. Resolve the conflicts below.")
    : status.error ? text(status.pending ? "尚未保存到数据库。修改仅在当前页面内存中，离开前请重试或导出。" : "同步暂时中断，请重试。", status.pending ? "Not saved to the database. Edits are in page memory; retry or export before leaving." : "Synchronization interrupted. Please retry.")
      : status.pending || status.saving ? text("正在保存到数据库…", "Saving to database…") : text("已保存到数据库", "Saved to database");
  return <>
    <WorkspacePreferences />
    {children}
    {(settings.error || settings.pending > 0) && <section role="status" data-testid="workspace-settings-status" className="fixed bottom-32 right-3 z-50 max-w-sm rounded-xl border bg-background p-3 text-xs shadow-md">
      <p>{settings.error === "settingsConflict" ? text("其他页面已修改配置，请先导出本次修改，再采用数据库版本。", "Settings changed elsewhere. Export your changes before loading the database version.") : settings.error === "databaseChanged" ? text("数据库已更换，请导出待保存配置后重新加载。", "The database changed. Export pending settings before reloading.") : settings.error ? text("配置尚未保存，请重试；离开前可导出。", "Settings are not saved. Retry or export before leaving.") : text("正在保存配置到数据库…", "Saving settings to database…")}</p>
      {settings.error && <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={exportPendingSettings}>{text("导出配置", "Export settings")}</Button>
        {["settingsConflict", "databaseChanged"].includes(settings.error) ? <Button size="sm" onClick={() => { void reloadWorkspaceSettings().catch(() => setActionError(true)); }}>{text("采用数据库版本", "Use database version")}</Button> : <Button size="sm" onClick={() => void flushWorkspaceSettings()}>{text("重试", "Retry")}</Button>}
      </div>}
    </section>}
    <section aria-label={text("简历保存状态", "Resume save status")} data-testid="resume-storage-status" className={`fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-50 max-h-[70dvh] max-w-sm overflow-y-auto rounded-xl border bg-background/95 p-3 text-xs shadow-md backdrop-blur md:bottom-3 ${status.error || status.conflicts.length ? "" : "pointer-events-none"}`} aria-live="polite">
      <p>{message}</p>
      {status.migrated && status.migrated.imported > 0 && <p className="mt-1 text-muted-foreground">{text(`已迁移 ${status.migrated.imported} 份旧简历${status.migrated.copied ? `，其中 ${status.migrated.copied} 份另存为副本` : ""}。`, `Imported ${status.migrated.imported} legacy resumes; ${status.migrated.copied} saved as copies.`)}</p>}
      {status.error && <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => void retryResumeDatabase()}>{text("重试", "Retry")}</Button>
        <Button size="sm" variant="outline" onClick={downloadResumeRecovery}>{text("导出备份", "Export backup")}</Button>
      </div>}
      {status.conflicts.map(conflict => <div key={conflict.id} className="mt-3 border-t pt-2">
        <p className="font-medium">{conflict.title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!conflict.deleted && <Button size="sm" onClick={() => { setActionError(false); void resolveResumeConflict(conflict.id, "copy")?.catch(() => setActionError(true)); }}>{text("保留我的修改为副本", "Keep my edits as a copy")}</Button>}
          <Button size="sm" variant="outline" onClick={() => { setActionError(false); void resolveResumeConflict(conflict.id, "server")?.catch(() => setActionError(true)); }}>{text("采用数据库版本", "Use database version")}</Button>
        </div>
      </div>)}
      {actionError && <p className="mt-2 text-destructive">{text("处理未完成，请重试；本机修改仍保留。", "Could not resolve the conflict. Local edits are retained.")}</p>}
    </section>
  </>;
}
