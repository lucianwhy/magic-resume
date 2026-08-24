import { FormEvent, useEffect, useState } from "react";
import {
    AlertCircle,
    LoaderCircle,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    createEducation,
    createProject,
    deleteEducation,
    deleteProject,
    fetchEducations,
    fetchProjects,
    updateProject,
} from "@/features/profile/api";
import type {
    Education,
    EducationCreate,
    Project,
    ProjectCreate,
} from "@/features/profile/types";

const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const emptyEducation: EducationCreate = {
    school: "",
    degree: "",
    major: "",
    start_date: "",
    end_date: "",
    study_status: null,
};

const emptyProject: ProjectCreate = {
    name: "",
    summary: "",
    tech_stack: [],
    responsibilities: "",
    completion_score: 0,
};

export default function ProfileResources() {
    const [educations, setEducations] = useState<Education[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const loadResources = async () => {
            try {
                const [educationData, projectData] = await Promise.all([
                    fetchEducations(),
                    fetchProjects(),
                ]);

                setEducations(educationData);
                setProjects(projectData);
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "无法读取教育经历和项目经历。"
                );
            } finally {
                setIsLoading(false);
            }
        };

        void loadResources();
    }, []);

    const handleEducationCreated = (education: Education) => {
        setEducations((current) => [education, ...current]);
    };

    const handleEducationDeleted = (educationId: string) => {
        setEducations((current) =>
            current.filter((item) => item.id !== educationId)
        );
    };

    const handleProjectCreated = (project: Project) => {
        setProjects((current) => [project, ...current]);
    };

    const handleProjectUpdated = (project: Project) => {
        setProjects((current) =>
            current.map((item) =>
                item.id === project.id ? project : item
            )
        );
    };

    const handleProjectDeleted = (projectId: string) => {
        setProjects((current) =>
            current.filter((item) => item.id !== projectId)
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在读取教育经历和项目经历
            </div>
        );
    }

    return (
        <div className="mt-6 space-y-6">
            {errorMessage && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {errorMessage}
                </div>
            )}

            <EducationSection
                educations={educations}
                onCreated={handleEducationCreated}
                onDeleted={handleEducationDeleted}
            />

            <ProjectSection
                projects={projects}
                onCreated={handleProjectCreated}
                onUpdated={handleProjectUpdated}
                onDeleted={handleProjectDeleted}
            />
        </div>
    );
}

function EducationSection({
    educations,
    onCreated,
    onDeleted,
}: {
    educations: Education[];
    onCreated: (education: Education) => void;
    onDeleted: (educationId: string) => void;
}) {
    const [form, setForm] = useState<EducationCreate>(emptyEducation);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const updateField = <K extends keyof EducationCreate>(
        field: K,
        value: EducationCreate[K]
    ) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.school.trim()) {
            setErrorMessage("学校名称不能为空。");
            return;
        }

        setIsSaving(true);
        setMessage("");
        setErrorMessage("");

        try {
            const education = await createEducation({
                ...form,
                school: form.school.trim(),
                degree: form.degree?.trim() || null,
                major: form.major?.trim() || null,
                start_date: form.start_date || null,
                end_date: form.end_date || null,
            });

            onCreated(education);
            setForm(emptyEducation);
            setMessage("教育经历已添加。");
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "添加教育经历失败。"
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (education: Education) => {
        const confirmed = window.confirm(
            `确定删除“${education.school}”这段教育经历吗？`
        );

        if (!confirmed) {
            return;
        }

        try {
            await deleteEducation(education.id);
            onDeleted(education.id);
            setMessage("教育经历已删除。");
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "删除教育经历失败。"
            );
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">教育经历</CardTitle>
                <CardDescription>
                    支持保存多段教育经历，例如本科、硕士或交换经历。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {educations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        暂无教育经历，请先添加一段。
                    </p>
                ) : (
                    <div className="space-y-3">
                        {educations.map((education) => (
                            <div
                                key={education.id}
                                className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-start md:justify-between"
                            >
                                <div>
                                    <h3 className="font-medium">
                                        {education.school}
                                    </h3>

                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {[education.degree, education.major]
                                            .filter(Boolean)
                                            .join(" · ") || "未填写学历或专业"}
                                    </p>

                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {[education.start_date, education.end_date]
                                            .filter(Boolean)
                                            .join(" 至 ") || "未填写起止时间"}
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void handleDelete(education)}
                                >
                                    <Trash2 />
                                    删除
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 border-t pt-5"
                >
                    <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <h3 className="font-medium">新增教育经历</h3>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="education-school">学校</Label>
                            <Input
                                id="education-school"
                                value={form.school}
                                onChange={(event) =>
                                    updateField("school", event.target.value)
                                }
                                placeholder="例如：河南工业大学"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="education-degree">学历</Label>
                            <Input
                                id="education-degree"
                                value={form.degree ?? ""}
                                onChange={(event) =>
                                    updateField("degree", event.target.value)
                                }
                                placeholder="例如：本科"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="education-major">专业</Label>
                            <Input
                                id="education-major"
                                value={form.major ?? ""}
                                onChange={(event) =>
                                    updateField("major", event.target.value)
                                }
                                placeholder="例如：数据科学与大数据技术"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="education-status">状态</Label>
                            <select
                                id="education-status"
                                className={selectClassName}
                                value={form.study_status ?? ""}
                                onChange={(event) =>
                                    updateField(
                                        "study_status",
                                        event.target.value === ""
                                            ? null
                                            : (event.target.value as EducationCreate["study_status"])
                                    )
                                }
                            >
                                <option value="">请选择</option>
                                <option value="studying">在读</option>
                                <option value="graduated">已毕业</option>
                                <option value="other">其他</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="education-start-date">开始时间</Label>
                            <Input
                                id="education-start-date"
                                type="month"
                                value={form.start_date ?? ""}
                                onChange={(event) =>
                                    updateField("start_date", event.target.value)
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="education-end-date">结束时间</Label>
                            <Input
                                id="education-end-date"
                                type="month"
                                value={form.end_date ?? ""}
                                onChange={(event) =>
                                    updateField("end_date", event.target.value)
                                }
                            />
                        </div>
                    </div>

                    <ResourceMessage
                        message={message}
                        errorMessage={errorMessage}
                    />

                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                            <LoaderCircle className="animate-spin" />
                        ) : (
                            <Save />
                        )}
                        {isSaving ? "保存中" : "添加教育经历"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function ProjectSection({
    projects,
    onCreated,
    onUpdated,
    onDeleted,
}: {
    projects: Project[];
    onCreated: (project: Project) => void;
    onUpdated: (project: Project) => void;
    onDeleted: (projectId: string) => void;
}) {
    const [form, setForm] = useState<ProjectCreate>(emptyProject);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const updateField = <K extends keyof ProjectCreate>(
        field: K,
        value: ProjectCreate[K]
    ) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const resetForm = () => {
        setForm(emptyProject);
        setEditingId(null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.name.trim()) {
            setErrorMessage("项目名称不能为空。");
            return;
        }

        setIsSaving(true);
        setMessage("");
        setErrorMessage("");

        const payload: ProjectCreate = {
            ...form,
            name: form.name.trim(),
            summary: form.summary?.trim() || null,
            responsibilities: form.responsibilities?.trim() || null,
            tech_stack: form.tech_stack,
        };

        try {
            if (editingId) {
                const project = await updateProject(editingId, payload);
                onUpdated(project);
                setMessage("项目已更新。");
            } else {
                const project = await createProject(payload);
                onCreated(project);
                setMessage("项目已添加。");
            }

            resetForm();
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "保存项目失败。"
            );
        } finally {
            setIsSaving(false);
        }
    };

    const startEdit = (project: Project) => {
        setEditingId(project.id);
        setForm({
            name: project.name,
            summary: project.summary ?? "",
            tech_stack: project.tech_stack,
            responsibilities: project.responsibilities ?? "",
            completion_score: project.completion_score,
        });
        setMessage("");
        setErrorMessage("");
    };

    const handleDelete = async (project: Project) => {
        const confirmed = window.confirm(
            `确定删除项目“${project.name}”吗？`
        );

        if (!confirmed) {
            return;
        }

        try {
            await deleteProject(project.id);
            onDeleted(project.id);
            setMessage("项目已删除。");

            if (editingId === project.id) {
                resetForm();
            }
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "删除项目失败。"
            );
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">项目经历</CardTitle>
                <CardDescription>
                    先手工记录项目，后续导入简历或代码仓库时再生成候选事实。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        暂无项目经历，请先添加一个项目。
                    </p>
                ) : (
                    <div className="space-y-3">
                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className="rounded-md border p-4"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="min-w-0">
                                        <h3 className="font-medium">{project.name}</h3>

                                        {project.summary && (
                                            <p className="mt-2 text-sm text-muted-foreground">
                                                {project.summary}
                                            </p>
                                        )}

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {project.tech_stack.map((technology) => (
                                                <span
                                                    key={technology}
                                                    className="rounded border px-2 py-1 text-xs text-muted-foreground"
                                                >
                                                    {technology}
                                                </span>
                                            ))}
                                        </div>

                                        <p className="mt-3 text-sm">
                                            完成度：{project.completion_score}%
                                        </p>

                                        {project.responsibilities && (
                                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                                                负责内容：{project.responsibilities}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => startEdit(project)}
                                        >
                                            <Pencil />
                                            编辑
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => void handleDelete(project)}
                                        >
                                            <Trash2 />
                                            删除
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 border-t pt-5"
                >
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            {editingId ? (
                                <Pencil className="h-4 w-4" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            <h3 className="font-medium">
                                {editingId ? "编辑项目" : "新增项目"}
                            </h3>
                        </div>

                        {editingId && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={resetForm}
                            >
                                <X />
                                取消编辑
                            </Button>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-name">项目名称</Label>
                        <Input
                            id="project-name"
                            value={form.name}
                            onChange={(event) =>
                                updateField("name", event.target.value)
                            }
                            placeholder="例如：AI 求职助手"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-summary">项目摘要</Label>
                        <Textarea
                            id="project-summary"
                            value={form.summary ?? ""}
                            onChange={(event) =>
                                updateField("summary", event.target.value)
                            }
                            placeholder="用一两句话说明项目解决了什么问题"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-tech-stack">
                            技术栈
                        </Label>
                        <Input
                            id="project-tech-stack"
                            value={form.tech_stack.join(", ")}
                            onChange={(event) =>
                                updateField(
                                    "tech_stack",
                                    event.target.value
                                        .split(",")
                                        .map((item) => item.trim())
                                        .filter(Boolean)
                                )
                            }
                            placeholder="例如：Python, FastAPI, PostgreSQL"
                        />
                        <p className="text-xs text-muted-foreground">
                            多个技术请使用英文逗号分隔。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-responsibilities">
                            本人负责内容
                        </Label>
                        <Textarea
                            id="project-responsibilities"
                            value={form.responsibilities ?? ""}
                            onChange={(event) =>
                                updateField(
                                    "responsibilities",
                                    event.target.value
                                )
                            }
                            placeholder="描述你实际负责的模块和工作"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="project-completion-score">
                            完成度：{form.completion_score}%
                        </Label>
                        <Input
                            id="project-completion-score"
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={form.completion_score}
                            onChange={(event) =>
                                updateField(
                                    "completion_score",
                                    Number(event.target.value)
                                )
                            }
                        />
                    </div>

                    <ResourceMessage
                        message={message}
                        errorMessage={errorMessage}
                    />

                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                            <LoaderCircle className="animate-spin" />
                        ) : (
                            <Save />
                        )}
                        {isSaving
                            ? "保存中"
                            : editingId
                                ? "保存项目修改"
                                : "添加项目"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function ResourceMessage({
    message,
    errorMessage,
}: {
    message: string;
    errorMessage: string;
}) {
    return (
        <div aria-live="polite" className="min-h-5 text-sm">
            {message && (
                <span className="text-emerald-600">{message}</span>
            )}

            {errorMessage && (
                <span className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {errorMessage}
                </span>
            )}
        </div>
    );
}