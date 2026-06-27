import api from "@/lib/api";

// ---- Types ----

export interface InstructorBatch {
  id: string;
  name: string;
  course_id: string;
  course_title?: string | null;
  duration_unit?: "weeks" | "days";
  delivery_mode: "live" | "recorded";
  status: "upcoming" | "active" | "completed" | "cancelled";
  start_date: string;
  end_date: string;
  enrolled_count: number;
  sessions_count: number;
  assignments_count: number;
  certificates_count: number;
  schedule_slots: {
    slot_type: string;
    weekday: number | null;
    slot_date: string | null;
    start_time: string | null;
    end_time: string | null;
  }[];
}

export interface InstructorDashboardStats {
  assigned_batches: number;
  students: number;
  sessions: number;
  pending_grading: number;
  active_batches: InstructorRecentBatch[];
  completed_batches: InstructorRecentBatch[];
  recent_batches: InstructorRecentBatch[];
}

export interface InstructorRecentBatch {
  id: string;
  name: string;
  status: string;
  delivery_mode: string;
  start_date: string | null;
  end_date: string | null;
}

export interface InstructorStudent {
  enrollment_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  status: "active" | "dropped" | "completed";
  enrolled_at: string | null;
}

export interface InstructorPlanItem {
  id: string;
  plan_index: number;
  title: string;
  summary?: string | null;
  unit?: "weeks" | "days";
  sessions: {
    id: string;
    title: string;
    scheduled_at: string | null;
    session_type: string;
    status: string;
  }[];
  assignments: {
    id: string;
    title: string;
    assignment_type: string;
    due_date: string | null;
  }[];
}

export interface InstructorResource {
  id: string;
  title: string;
  resource_type: "file" | "link" | "video";
  url: string;
  uploaded_at: string | null;
  // Populated by backend when resource_type === "video" (url is "video://<id>")
  video_id?: string;
  status?: "uploaded" | "queued" | "processing" | "ready" | "failed" | "missing";
  error_message?: string | null;
  duration_seconds?: number | null;
  original_size_bytes?: number | null;
}

export interface InstructorSession {
  id: string;
  batch_id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  session_type: "live" | "recorded";
  status: "scheduled" | "completed" | "cancelled";
  origin: "inherited" | "manual";
  meeting_link: string | null;
  recording_url: string | null;
  scheduled_at: string;
  duration_mins: number;
  resources: InstructorResource[];
}

export interface InstructorAssignment {
  id: string;
  batch_id: string;
  plan_id: string | null;
  session_id: string | null;
  title: string;
  description: string | null;
  assignment_type: "quiz" | "pdf_upload" | "text_upload" | "file_upload" | "link_submission";
  max_points: number | null;
  due_date: string | null;
  allow_late: boolean;
  submission_count: number;
}

export interface InstructorSubmission {
  id: string;
  assignment_id: string;
  assignment_title: string;
  assignment_max_points: number | null;
  assignment_allow_late: boolean;
  assignment_due_date: string | null;
  student_id: string;
  student_name: string;
  student_email: string;
  content: string | null;
  file_url: string | null;
  score: number | null;
  feedback: string | null;
  status: "submitted" | "graded" | "late" | "missing";
  submitted_at: string | null;
  graded_at: string | null;
  is_late: boolean;
}

export interface InstructorAttendanceRow {
  student_id: string;
  student_name: string;
  student_email: string;
  status: "not_marked" | "present" | "absent" | "late" | "excused";
  notes: string | null;
  marked_at: string | null;
}

// ---- API calls ----

export async function fetchDashboard() {
  const res = await api.get("/instructor/dashboard/stats");
  return res.data.data as InstructorDashboardStats;
}

export async function fetchBatches() {
  const res = await api.get("/instructor/batches");
  return res.data.data as InstructorBatch[];
}

export async function fetchBatchStudents(batchId: string) {
  const res = await api.get(`/instructor/batches/${batchId}/students`);
  return res.data.data as InstructorStudent[];
}

export async function fetchBatchPlan(batchId: string) {
  const res = await api.get(`/instructor/batches/${batchId}/plan`);
  return res.data.data as InstructorPlanItem[];
}

export async function fetchSessions(batchId: string) {
  const res = await api.get(`/instructor/batches/${batchId}/sessions`);
  return res.data.data as InstructorSession[];
}

export async function createSession(
  batchId: string,
  payload: {
    plan_id?: string | null;
    title: string;
    description?: string;
    session_type: "live" | "recorded";
    scheduled_at: string;
    duration_mins: number;
    meeting_link?: string;
    recording_url?: string;
  }
) {
  const res = await api.post(`/instructor/batches/${batchId}/sessions`, payload);
  return res.data.data as InstructorSession;
}

export async function updateSession(
  sessionId: string,
  payload: Partial<{
    title: string;
    description: string;
    session_type: string;
    status: string;
    meeting_link: string;
    recording_url: string;
    scheduled_at: string;
    duration_mins: number;
    notify_students: boolean;
  }>
) {
  const res = await api.put(`/instructor/sessions/${sessionId}`, payload);
  return res.data as {
    success: true;
    data: InstructorSession;
    meta: { changes: string[]; students_notified: number };
  };
}

export async function deleteSession(sessionId: string) {
  await api.delete(`/instructor/sessions/${sessionId}`);
}

export async function addResource(
  sessionId: string,
  payload: { title: string; resource_type: "file" | "link" | "video"; file?: File; url?: string }
) {
  const fd = new FormData();
  fd.append("title", payload.title);
  fd.append("resource_type", payload.resource_type);
  if (payload.file) fd.append("file", payload.file);
  if (payload.url) fd.append("url", payload.url);
  const res = await api.post(`/instructor/sessions/${sessionId}/resources`, fd);
  return res.data.data as InstructorResource;
}

export async function deleteResource(resourceId: string) {
  await api.delete(`/instructor/resources/${resourceId}`);
}

export async function fetchAssignments(batchId: string) {
  const res = await api.get(`/instructor/batches/${batchId}/assignments`);
  return res.data.data as InstructorAssignment[];
}

export async function createAssignment(
  batchId: string,
  payload: {
    plan_id?: string | null;
    session_id?: string | null;
    title: string;
    description?: string;
    assignment_type: string;
    due_date?: string | null;
    max_points?: number | null;
    allow_late: boolean;
  }
) {
  const res = await api.post(`/instructor/batches/${batchId}/assignments`, payload);
  return res.data.data as InstructorAssignment;
}

export async function updateAssignment(assignmentId: string, payload: Record<string, unknown>) {
  const res = await api.put(`/instructor/assignments/${assignmentId}`, payload);
  return res.data.data as InstructorAssignment;
}

export async function deleteAssignment(assignmentId: string) {
  await api.delete(`/instructor/assignments/${assignmentId}`);
}

export async function fetchSubmissions(batchId: string) {
  const res = await api.get(`/instructor/batches/${batchId}/submissions`);
  return res.data.data as InstructorSubmission[];
}

export async function gradeSubmission(
  submissionId: string,
  payload: { score?: number; feedback?: string; status?: string }
) {
  const res = await api.put(`/instructor/submissions/${submissionId}`, payload);
  return res.data.data as { id: string; score: number | null; feedback: string | null; status: string };
}

export async function fetchAttendance(sessionId: string) {
  const res = await api.get(`/instructor/sessions/${sessionId}/attendance`);
  return res.data.data as InstructorAttendanceRow[];
}

export async function setAttendance(
  sessionId: string,
  entries: { student_id: string; status: string; notes?: string }[]
) {
  const res = await api.put(`/instructor/sessions/${sessionId}/attendance`, { entries });
  return res.data.data as { saved: number };
}

export async function completeStudents(batchId: string, studentIds: string[]) {
  const res = await api.post(`/instructor/batches/${batchId}/complete-students`, {
    student_ids: studentIds,
  });
  return res.data.data as {
    completed: number;
    failed: number;
    errors: string[];
    batch_status: string;
  };
}

export async function resendCertificates(batchId: string, studentIds: string[]) {
  const res = await api.post(`/instructor/batches/${batchId}/resend-certificates`, {
    student_ids: studentIds,
  });
  return res.data.data as { resent: number; failed: number };
}

export async function changePassword(currentPassword: string, newPassword: string) {
  await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
