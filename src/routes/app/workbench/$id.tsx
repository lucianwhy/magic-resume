import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import WorkbenchPage from "@/app/app/workbench/[id]/page";
import { useResumeStore } from "@/store/useResumeStore";
import { useLocale } from "@/i18n/compat/client";

export const Route = createFileRoute("/app/workbench/$id")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }]
  }),
  ssr: false,
  component: WorkbenchRoutePage
});

function WorkbenchRoutePage() {
  const { id } = Route.useParams();
  const setActiveResume = useResumeStore((state) => state.setActiveResume);
  const exists = useResumeStore((state) => !!state.resumes[id]);
  const en = useLocale() === "en";

  useEffect(() => {
    if (exists) setActiveResume(id);
  }, [id, exists, setActiveResume]);

  if (!exists) return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
    <h1 className="text-lg font-semibold">{en ? "Resume not found or deleted" : "简历不存在或已删除"}</h1>
    <Link to="/app/dashboard/resumes" className="text-sm underline">{en ? "Back to resumes" : "返回简历列表"}</Link>
  </main>;

  return <WorkbenchPage />;
}
