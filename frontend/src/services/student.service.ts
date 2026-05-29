import api from "@/lib/api";

export interface StudentBatch {
  id: string;
  name: string;
  course_id: string;
  course_title: string | null;
  course_banner: string | null;
  delivery_mode: "live" | "recorded";
  status: "upcoming" | "active" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  instructor_name: string | null;
  enrollment_status: "active" | "dropped" | "completed";
}

export type StudentResource =
  | {
      id: string;
      title: string;
      resource_type: "file" | "link";
      url: string;
    }
  | {
      id: string;
      title: string;
      resource_type: "video";
      video_id: string;
      status: "uploaded" | "queued" | "processing" | "ready" | "failed" | "missing";
      duration_seconds: number | null;
      playback_url: string | null;
    };

export interface StudentSession {
  id: string;
  title: string;
  description: string | null;
  session_type: "live" | "recorded";
  status: "scheduled" | "completed" | "cancelled";
  scheduled_at: string | null;
  duration_mins: number;
  meeting_link: string | null;
  recording_url: string | null;
  resources: StudentResource[];
}

export interface StudentAssignment {
  id: string;
  title: string;
  description: string | null;
  assignment_type: "quiz" | "pdf_upload" | "text_upload" | "file_upload" | "link_submission";
  due_date: string | null;
  max_points: number | null;
  allow_late: boolean;
  submission: {
    id: string;
    content: string | null;
    file_url: string | null;
    score: number | null;
    feedback: string | null;
    status: "submitted" | "graded" | "late" | "missing";
    submitted_at: string | null;
    graded_at: string | null;
  } | null;
}

export interface StudentCertificate {
  id: string;
  batch_name: string;
  course_title: string;
  pdf_url: string | null;
  email_status: "pending" | "sent" | "failed";
  issued_at: string | null;
}

export async function fetchMyBatches() {
  const res = await api.get("/student/batches");
  return res.data.data as StudentBatch[];
}

export async function fetchBatchSessions(batchId: string) {
  const res = await api.get(`/student/batches/${batchId}/sessions`);
  return res.data.data as StudentSession[];
}

export async function fetchBatchAssignments(batchId: string) {
  const res = await api.get(`/student/batches/${batchId}/assignments`);
  return res.data.data as StudentAssignment[];
}

export async function submitAssignment(
  assignmentId: string,
  payload: { content?: string; url?: string; file?: File }
) {
  const fd = new FormData();
  if (payload.content) fd.append("content", payload.content);
  if (payload.url) fd.append("url", payload.url);
  if (payload.file) fd.append("file", payload.file);
  const res = await api.post(`/student/assignments/${assignmentId}/submit`, fd);
  return res.data.data as { id: string; status: string; submitted_at: string; is_late: boolean };
}

export async function fetchMyCertificates() {
  const res = await api.get("/student/certificates");
  return res.data.data as StudentCertificate[];
}

// ---- Profile ----

export interface EducationEntry {
  qualification: string;
  institution: string;
  field_of_study: string;
  completion_year: string;
}

export interface ExperienceEntry {
  organisation: string;
  post: string;
  description?: string | null;
}

export interface StudentProfile {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string;
  mobile: string | null;
  city: string | null;
  occupation: "student" | "employee" | null;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  avatar_url: string | null;
  profile_complete: boolean;
}

export interface ProfileUpdate {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  mobile: string;
  city: string;
  occupation: "student" | "employee";
  education: EducationEntry[];
  experience: ExperienceEntry[];
}

export async function fetchProfile() {
  const res = await api.get("/student/profile");
  return res.data.data as StudentProfile;
}

export async function updateProfile(payload: ProfileUpdate) {
  const res = await api.patch("/student/profile", payload);
  return res.data.data as StudentProfile;
}

// ---- Progress + attendance ----

export interface BatchProgress {
  batch_id: string;
  overall_percent: number;
  sessions: { done: number; total: number };
  assignments: { graded: number; total: number };
  attendance: { present: number; total: number };
}

export interface AttendanceItem {
  session_id: string;
  session_title: string;
  scheduled_at: string | null;
  status: "present" | "absent" | "late" | "excused" | "not_marked";
  source: string;
  marked_at: string | null;
  notes: string | null;
}

export async function fetchBatchProgress(batchId: string) {
  const res = await api.get(`/student/batches/${batchId}/progress`);
  return res.data.data as BatchProgress;
}

export async function fetchBatchAttendance(batchId: string) {
  const res = await api.get(`/student/batches/${batchId}/attendance`);
  return res.data.data as AttendanceItem[];
}
