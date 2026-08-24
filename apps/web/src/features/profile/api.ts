import type {
  Education,
  EducationCreate,
  EducationUpdate,
  Profile,
  ProfileUpdate,
  Project,
  ProjectCreate,
  ProjectUpdate,
} from "./types";

const API_BASE_URL =
  import.meta.env.VITE_PROFILE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let message = `请求失败，状态码：${response.status}`;

    try {
      const errorData = await response.json();

      if (typeof errorData.detail === "string") {
        message = errorData.detail;
      }
    } catch {
      // 响应不是 JSON 时使用默认错误信息。
    }

    throw new Error(message);
  }

  // DELETE 接口返回 204，没有响应体。
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function fetchProfile() {
  return request<Profile>("/api/v1/profile");
}

export function updateProfile(data: ProfileUpdate) {
  return request<Profile>("/api/v1/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function fetchEducations() {
  return request<Education[]>("/api/v1/educations");
}

export function createEducation(data: EducationCreate) {
  return request<Education>("/api/v1/educations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateEducation(
  educationId: string,
  data: EducationUpdate
) {
  return request<Education>(`/api/v1/educations/${educationId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteEducation(educationId: string) {
  return request<void>(`/api/v1/educations/${educationId}`, {
    method: "DELETE",
  });
}

export function fetchProjects() {
  return request<Project[]>("/api/v1/projects");
}

export function createProject(data: ProjectCreate) {
  return request<Project>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProject(
  projectId: string,
  data: ProjectUpdate
) {
  return request<Project>(`/api/v1/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteProject(projectId: string) {
  return request<void>(`/api/v1/projects/${projectId}`, {
    method: "DELETE",
  });
}

/*
* 这是浏览器请求后端的唯一入口。以后改成环境变量、添加登录Token、处理统一错误，都在这里做
* */