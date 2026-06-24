import api from "@/lib/api";

export interface PublicCourseListItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  course_type: "live" | "self_paced";
  duration_unit: "weeks" | "days";
  duration_value: number;
  price: number;
  discount: number;
  banner_url: string | null;
  tags: string[];
  batches_count: number;
}

export interface PublicInstructor {
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
}

export interface PublicCourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  course_type: "live" | "self_paced";
  duration_unit: "weeks" | "days";
  duration_value: number;
  price: number;
  discount: number;
  banner_url: string | null;
  tags: string[];
  syllabus_items: any[];
  faqs: any[];
  certification_criteria: any[];
  syllabus_pdf_url: string | null;
  demo_youtube_url: string | null;
  instructors: PublicInstructor[];
  certificate_template: PublicCertificateTemplate | null;
}

export interface PublicCertificateTemplate {
  template_url: string;
  template_type: "pdf" | "image";
  field_config: any;
}

export interface PublicScheduleSlot {
  slot_type: string;
  weekday: number | null;
  slot_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

export interface PublicBatch {
  id: string;
  name: string;
  delivery_mode: "live" | "recorded";
  status: string;
  start_date: string | null;
  end_date: string | null;
  capacity: number | null;
  enrolled_count: number;
  seats_left: number | null;
  is_full: boolean;
  enrollment_open: boolean;
  enrollment_closes_on: string | null;
  instructor_name: string | null;
  schedule_slots: PublicScheduleSlot[];
}

export async function listPublicCourses(search?: string) {
  const res = await api.get("/public/courses", {
    params: search && search.trim() ? { search: search.trim() } : undefined,
  });
  return res.data.data as PublicCourseListItem[];
}

export async function getPublicCourse(idOrSlug: string) {
  const res = await api.get(`/public/courses/${idOrSlug}`);
  return res.data.data as PublicCourseDetail;
}

export async function getPublicCourseBatches(courseId: string) {
  const res = await api.get(`/public/courses/${courseId}/batches`);
  return res.data.data as PublicBatch[];
}

/** Final payable = price − (price × discount%), matching what the backend charges.
 *  `discount` is a percentage (0–100), NOT an absolute rupee amount. */
export function finalPrice(price: number, discount: number): number {
  return Math.max(price - (price * (discount || 0)) / 100, 0);
}
