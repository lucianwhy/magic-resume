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
