import type { Profile, ProfileUpdate } from "./types";

const API_BASE_URL = "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
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

/*
* 这是浏览器请求后端的唯一入口。以后改成环境变量、添加登录Token、处理统一错误，都在这里做
* */