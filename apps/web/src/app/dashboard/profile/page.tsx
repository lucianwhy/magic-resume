import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchProfile, updateProfile } from "@/features/profile/api";
import type {
  JobStatus,
  Profile,
  ProfileUpdate,
  StudyStatus,
} from "@/features/profile/types";

const emptyProfile: Profile = {
  user_id: "",
  name: null,
  phone: null,
  email: null,
  city: null,
  school: null,
  major: null,
  graduation_date: null,
  study_status: null,
  job_status: null,
  target_role: null,
  updated_at: "",
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const ProfilePage = () => {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await fetchProfile();
        setProfile(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "无法读取个人信息，请确认后端服务已启动。"
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const updateField = (
    field: keyof ProfileUpdate,
    value: ProfileUpdate[keyof ProfileUpdate]
  ) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setErrorMessage("");

    const { user_id, updated_at, ...data } = profile;

    try {
      const savedProfile = await updateProfile(data);
      setProfile(savedProfile);
      setMessage("个人信息已保存到后端。");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保存失败，请稍后重试。"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        正在读取个人信息
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-primary">
          <UserRound className="h-5 w-5" />
          <span className="text-sm font-medium">个人中心</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">固定信息</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          这些信息将作为简历、项目经历和面试训练的基础资料。
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本资料与求职状态</CardTitle>
            <CardDescription>
              必填信息先保持最小化，后续可继续扩展教育经历和技能标签。
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={profile.name ?? ""}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="请输入姓名"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">联系方式</Label>
              <Input
                id="phone"
                value={profile.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="请输入手机号"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={profile.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">所在城市</Label>
              <Input
                id="city"
                value={profile.city ?? ""}
                onChange={(event) => updateField("city", event.target.value)}
                placeholder="例如：杭州"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="school">毕业院校</Label>
              <Input
                id="school"
                value={profile.school ?? ""}
                onChange={(event) => updateField("school", event.target.value)}
                placeholder="请输入学校名称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="major">专业</Label>
              <Input
                id="major"
                value={profile.major ?? ""}
                onChange={(event) => updateField("major", event.target.value)}
                placeholder="请输入专业"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduation-date">毕业时间</Label>
              <Input
                id="graduation-date"
                type="month"
                value={profile.graduation_date ?? ""}
                onChange={(event) =>
                  updateField("graduation_date", event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="study-status">在读状态</Label>
              <select
                id="study-status"
                className={selectClassName}
                value={profile.study_status ?? ""}
                onChange={(event) =>
                  updateField(
                    "study_status",
                    (event.target.value || null) as StudyStatus | null
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
              <Label htmlFor="job-status">当前求职状态</Label>
              <select
                id="job-status"
                className={selectClassName}
                value={profile.job_status ?? ""}
                onChange={(event) =>
                  updateField(
                    "job_status",
                    (event.target.value || null) as JobStatus | null
                  )
                }
              >
                <option value="">请选择</option>
                <option value="looking_for_internship">寻找实习</option>
                <option value="looking_for_full_time">寻找全职</option>
                <option value="employed">已就业</option>
                <option value="other">其他</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-role">目标岗位</Label>
              <Input
                id="target-role"
                value={profile.target_role ?? ""}
                onChange={(event) =>
                  updateField("target_role", event.target.value)
                }
                placeholder="例如：后端开发工程师"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <div aria-live="polite" className="text-sm">
              {message && <span className="text-emerald-600">{message}</span>}
              {errorMessage && (
                <span className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {errorMessage}
                </span>
              )}
            </div>

            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Save />
              )}
              {isSaving ? "保存中" : "保存修改"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default ProfilePage;