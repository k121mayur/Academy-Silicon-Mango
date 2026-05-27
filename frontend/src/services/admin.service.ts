import api from "@/lib/api";

export interface CourseDTO {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category?: string;
  course_type: string;
  duration_unit: string;
  duration_value: number;
  price: number | string;
  discount: number | string;
  tags: string[];
  syllabus_items: { order: number; title: string; description?: string }[];
  faqs: { order: number; question: string; answer: string }[];
  certification_criteria: { order: number; text: string }[];
  banner_url?: string;
  syllabus_pdf_url?: string;
  is_published: boolean;
  batches_count?: number;
  created_at?: string;
}

export interface BatchDTO {
  id: string;
  course_id: string;
  course_title?: string;
  instructor_id?: string | null;
  instructor_name?: string | null;
  name: string;
  delivery_mode: string;
  status: string;
  start_date: string;
  end_date: string;
  capacity?: number | null;
  enrolled_count: number;
  is_locked: boolean;
}

export interface InstructorDTO {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  bio?: string;
  skills: string[];
  avatar_url?: string;
  is_active: boolean;
  created_at?: string;
}

export interface StudentDTO {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  phone?: string;
  city?: string;
  profile_complete: boolean;
  avatar_url?: string;
  is_active: boolean;
  auth_provider?: string;
  enrollments_count?: number;
  created_at?: string;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

// ---- Dashboard ----
export async function fetchDashboardStats() {
  const res = await api.get("/admin/dashboard/stats");
  return res.data.data;
}
export async function fetchRevenueChart(days = 30) {
  const res = await api.get(`/admin/dashboard/revenue-chart?days=${days}`);
  return res.data.data as { date: string; amount: number }[];
}
export async function fetchRecentTransactions() {
  const res = await api.get("/admin/dashboard/recent-transactions");
  return res.data.data as Array<{
    id: string;
    student_email: string;
    batch_name: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
}
export async function fetchUpcomingSessions() {
  const res = await api.get("/admin/dashboard/upcoming-sessions");
  return res.data.data as Array<{
    id: string;
    title: string;
    batch_name: string;
    scheduled_at: string;
    duration_mins: number;
    session_type: string;
  }>;
}

// ---- Courses ----
export async function listCourses(params: { page?: number; limit?: number; search?: string; type?: string; published?: boolean } = {}) {
  const res = await api.get<PaginatedResponse<CourseDTO>>("/admin/courses", { params });
  return res.data;
}
export async function getCourse(id: string) {
  const res = await api.get<CourseDTO>(`/admin/courses/${id}`);
  return res.data;
}
export async function createCourse(payload: Partial<CourseDTO>) {
  const res = await api.post<CourseDTO>("/admin/courses", payload);
  return res.data;
}
export async function updateCourse(id: string, payload: Partial<CourseDTO>) {
  const res = await api.put<CourseDTO>(`/admin/courses/${id}`, payload);
  return res.data;
}
export async function deleteCourse(id: string) {
  await api.delete(`/admin/courses/${id}`);
}
export async function togglePublishCourse(id: string) {
  const res = await api.patch<CourseDTO>(`/admin/courses/${id}/publish`);
  return res.data;
}
export async function uploadCourseBanner(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/admin/courses/${id}/banner`, fd);
  return res.data.data.banner_url as string;
}
export async function uploadCourseSyllabus(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/admin/courses/${id}/syllabus`, fd);
  return res.data.data.syllabus_pdf_url as string;
}
export async function listCourseInstructors(courseId: string) {
  const res = await api.get(`/admin/courses/${courseId}/instructors`);
  return res.data.data as Array<{ id: string; user_id: string; email: string; display_name: string; avatar_url?: string }>;
}
export async function assignCourseInstructor(courseId: string, instructorId: string) {
  await api.post(`/admin/courses/${courseId}/instructors`, { instructor_id: instructorId });
}
export async function removeCourseInstructor(courseId: string, instructorId: string) {
  await api.delete(`/admin/courses/${courseId}/instructors/${instructorId}`);
}

// ---- Batches ----
export async function listBatches(params: { page?: number; limit?: number; course_id?: string; status?: string; mode?: string; search?: string } = {}) {
  const res = await api.get<PaginatedResponse<BatchDTO>>("/admin/batches", { params });
  return res.data;
}
export async function getBatch(id: string) {
  const res = await api.get<BatchDTO>(`/admin/batches/${id}`);
  return res.data;
}
export async function createBatch(payload: any) {
  const res = await api.post("/admin/batches", payload);
  return res.data as BatchDTO;
}
export async function updateBatch(id: string, payload: any) {
  const res = await api.put(`/admin/batches/${id}`, payload);
  return res.data as BatchDTO;
}
export async function batchAssignInstructor(id: string, instructorId: string) {
  const res = await api.post(`/admin/batches/${id}/assign-instructor`, { instructor_id: instructorId });
  return res.data as BatchDTO;
}
export async function batchPlans(id: string) {
  const res = await api.get(`/admin/batches/${id}/plans`);
  return res.data as Array<{ id: string; plan_index: number; title: string; summary?: string }>;
}
export async function updateBatchPlans(id: string, plans: Array<{ plan_index: number; title: string; summary?: string }>) {
  await api.put(`/admin/batches/${id}/plans`, plans);
}
export async function syncBatchSessions(id: string) {
  const res = await api.post(`/admin/batches/${id}/sync-sessions`);
  return res.data.data as { sessions_created: number };
}
export async function batchEnrollments(id: string) {
  const res = await api.get(`/admin/batches/${id}/enrollments`);
  return res.data as Array<{ id: string; student_id: string; student_name: string; student_email: string; enrolled_at: string; status: string }>;
}
export async function batchEnroll(id: string, studentId: string) {
  const res = await api.post(`/admin/batches/${id}/enroll`, { student_id: studentId });
  return res.data;
}
export async function batchRemoveEnrollment(batchId: string, enrollmentId: string) {
  await api.delete(`/admin/batches/${batchId}/enrollments/${enrollmentId}`);
}
export async function completeBatch(id: string) {
  const res = await api.post(`/admin/batches/${id}/complete`);
  return res.data as BatchDTO;
}

// ---- Users ----
export async function listInstructors(params: { page?: number; limit?: number; search?: string } = {}) {
  const res = await api.get<PaginatedResponse<InstructorDTO>>("/admin/users/instructors", { params });
  return res.data;
}
export async function createInstructor(payload: { email: string; display_name: string; bio?: string; skills?: string[]; password?: string }) {
  const res = await api.post("/admin/users/instructors", payload);
  return res.data.data as { id: string; user_id: string; email: string; display_name: string; temporary_password?: string };
}
export async function listStudents(params: { page?: number; limit?: number; search?: string } = {}) {
  const res = await api.get<PaginatedResponse<StudentDTO>>("/admin/users/students", { params });
  return res.data;
}
export async function createStudent(payload: { email: string; display_name: string; password: string; phone?: string; city?: string; batch_name?: string; instructor_name?: string }) {
  const res = await api.post("/admin/users/students", payload);
  return res.data.data;
}
export async function getStudent(userId: string) {
  const res = await api.get(`/admin/users/students/${userId}`);
  return res.data.data;
}

// ---- Enrollments ----
export async function listAllEnrollments(params: { page?: number; limit?: number } = {}) {
  const res = await api.get("/admin/enrollments", { params });
  return res.data;
}
export async function adminEnroll(payload: { student_id: string; batch_id: string }) {
  const res = await api.post("/admin/enrollments", payload);
  return res.data;
}

// ---- Payments ----
export async function listPayments(params: { page?: number; limit?: number; status?: string } = {}) {
  const res = await api.get("/admin/payments", { params });
  return res.data;
}
export async function getPaymentSettings() {
  const res = await api.get("/admin/payment-settings");
  return res.data as { mode: string; key_id_masked?: string; has_credentials: boolean };
}
export async function updatePaymentSettings(payload: { mode: string; key_id: string; key_secret: string }) {
  const res = await api.put("/admin/payment-settings", payload);
  return res.data;
}

// ---- Certificates ----
export async function listCertTemplates(courseId?: string) {
  const res = await api.get("/admin/certificate-templates", { params: courseId ? { course_id: courseId } : {} });
  return res.data.data as Array<{ id: string; course_id: string; template_url?: string; field_config: Record<string, unknown> }>;
}
export async function uploadCertTemplate(courseId: string, file: File, fieldConfig: Record<string, unknown> = {}) {
  const fd = new FormData();
  fd.append("course_id", courseId);
  fd.append("field_config", JSON.stringify(fieldConfig));
  fd.append("file", file);
  const res = await api.post("/admin/certificate-templates", fd, { headers: { "Content-Type": "multipart/form-data" } });
  return res.data.data;
}
export async function listCertificates(batchId?: string) {
  const res = await api.get("/admin/certificates", { params: batchId ? { batch_id: batchId } : {} });
  return res.data.data;
}
export async function generateCertificates(batchId: string) {
  const res = await api.post("/admin/certificates/generate", { batch_id: batchId });
  return res.data.data as { created: number };
}
export async function resendCertificate(certId: string) {
  await api.post(`/admin/certificates/${certId}/resend`);
}

export interface VerifyCertificateResult {
  valid: boolean;
  student_name?: string;
  course_title?: string;
  batch_name?: string;
  batch_start?: string;
  batch_end?: string;
  issued_at?: string;
}

export async function verifyCertificate(certId: string) {
  const res = await api.get(`/public/verify-certificate/${certId}`);
  return res.data.data as VerifyCertificateResult;
}
