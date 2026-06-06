import api from "@/lib/api";

export type WebinarStatus = "upcoming" | "live" | "past" | "cancelled";

export interface WebinarHost {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website: string | null;
  contact_email: string | null;
}

export interface PublicWebinarListItem {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  language: string;
  flyer_url: string | null;
  banner_url: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  duration_mins: number;
  is_free: boolean;
  price: number;
  currency: string;
  status: WebinarStatus;
  registration_state: string;
  seats_left: number | null;
  max_participants: number | null;
  host: WebinarHost | null;
}

export interface WebinarFAQ {
  question: string;
  answer: string;
}

export interface PublicWebinarDetail extends PublicWebinarListItem {
  description: string | null;
  faqs: WebinarFAQ[];
  provider_type: string;
  registration_open_at: string | null;
  registration_close_at: string | null;
  allow_waitlist: boolean;
  meta_title: string;
  meta_description: string;
  og_image_url: string | null;
  meeting_url: string | null;
  meeting_link_public: boolean;
  calendar_url: string;
  ics_url: string;
  detail_url: string;
}

export interface RegisterPayload {
  full_name: string;
  email: string;
  date_of_birth: string;
  gender: string;
  profession: string;
  captcha_token?: string;
  referral_source?: string;
  utm?: Record<string, string>;
}

export interface VerifyResult {
  verified: boolean;
  waitlisted: boolean;
  webinar: { id: string; slug: string; title: string; start_at: string | null; status: WebinarStatus };
}

export async function listPublicWebinars(status?: string, search?: string) {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  if (search && search.trim()) params.search = search.trim();
  const res = await api.get("/public/webinars", { params: Object.keys(params).length ? params : undefined });
  return res.data.data as PublicWebinarListItem[];
}

export async function getPublicWebinar(idOrSlug: string) {
  const res = await api.get(`/public/webinars/${idOrSlug}`);
  return res.data.data as PublicWebinarDetail;
}

export async function registerForWebinar(webinarId: string, payload: RegisterPayload) {
  const res = await api.post(`/public/webinars/${webinarId}/register`, payload);
  return res.data as { success: boolean; data: { status: string; will_waitlist?: boolean; resent?: boolean }; message?: string };
}

export async function verifyWebinarRegistration(token: string) {
  const res = await api.post(`/public/webinars/registrations/verify`, { token });
  return res.data.data as VerifyResult;
}

export async function resendWebinarVerification(webinarId: string, email: string, captcha_token?: string) {
  const res = await api.post(`/public/webinars/${webinarId}/resend-verification`, { email, captcha_token });
  return res.data as { success: boolean; message?: string };
}

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-Binary" },
  { value: "prefer_not_to_say", label: "Prefer Not To Say" },
];

export const PROFESSION_OPTIONS = [
  "Student",
  "Teacher",
  "NGO Professional",
  "Software Developer",
  "Entrepreneur",
  "Government Employee",
  "Consultant",
  "Homemaker",
  "Other",
];

/** Render a webinar timestamp in the webinar's own timezone. */
export function formatWebinarWhen(iso: string | null, tz: string): string {
  if (!iso) return "To be announced";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Short date for cards. */
export function formatWebinarDate(iso: string | null, tz: string): string {
  if (!iso) return "TBA";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Compact "starts in 3d 4h" style countdown; "" when in the past. */
export function countdownTo(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "";
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Human label for a registration_state value returned by the API. */
export function registrationStateLabel(state: string): string {
  switch (state) {
    case "open":
      return "Registration open";
    case "not_open":
      return "Registration opens soon";
    case "closed":
      return "Registration closed";
    case "full":
      return "Webinar full";
    case "waitlist":
      return "Waitlist open";
    default:
      return state;
  }
}
