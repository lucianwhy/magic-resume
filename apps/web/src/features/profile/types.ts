export type StudyStatus = "studying" | "graduated" | "other";

export type JobStatus =
  | "looking_for_internship"
  | "looking_for_full_time"
  | "employed"
  | "other";

export interface Profile {
  user_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  school: string | null;
  major: string | null;
  graduation_date: string | null;
  study_status: StudyStatus | null;
  job_status: JobStatus | null;
  target_role: string | null;
  updated_at: string;
}

export type ProfileUpdate = Omit<Profile, "user_id" | "updated_at">;
/*
它的作用是让前端数据结构和Python的ProfileResponse保持一致*/

export interface Education {
  id: string;
  user_id: string;
  school: string;
  degree: string | null;
  major: string | null;
  start_date: string | null;
  end_date: string | null;
  study_status: StudyStatus | null;
  created_at: string;
  updated_at: string;
}

export interface EducationCreate {
  school: string;
  degree?: string | null;
  major?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  study_status?: StudyStatus | null;
}

export type EducationUpdate = Partial<EducationCreate>;

export interface Project {
  id: string;
  user_id: string;
  name: string;
  summary: string | null;
  tech_stack: string[];
  responsibilities: string | null;
  completion_score: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  summary?: string | null;
  tech_stack: string[];
  responsibilities?: string | null;
  completion_score: number;
}

export type ProjectUpdate = Partial<ProjectCreate>;