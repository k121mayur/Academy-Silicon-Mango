import api from "@/lib/api";

// ---------------------------------------------------------------------------
// Organizations (hosts / brands)
// ---------------------------------------------------------------------------

export interface OrganizationDTO {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website: string | null;
  contact_email: string | null;
  is_default: boolean;
  webinars_count: number;
  created_at?: string;
}

export async function listOrganizations() {
  const res = await api.get("/admin/organizations");
  return res.data.data as OrganizationDTO[];
}

export async function createOrganization(payload: Partial<OrganizationDTO>) {
  const res = await api.post("/admin/organizations", payload);
  return res.data.data as OrganizationDTO;
}

export async function updateOrganization(id: string, payload: Partial<OrganizationDTO>) {
  const res = await api.put(`/admin/organizations/${id}`, payload);
  return res.data.data as OrganizationDTO;
}

export async function deleteOrganization(id: string) {
  await api.delete(`/admin/organizations/${id}`);
}

export async function uploadOrganizationLogo(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/admin/organizations/${id}/logo`, fd);
  return res.data.data.logo_url as string;
}

// ---------------------------------------------------------------------------
// Webinars
// ---------------------------------------------------------------------------

export interface WebinarListItem {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  flyer_url: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone: string;
  is_free: boolean;
  price: number;
  currency: string;
  is_published: boolean;
  is_cancelled: boolean;
  status: string;
  host: { id: string; name: string } | null;
  registrations_count: number;
}

export interface WebinarCounts {
  total: number;
  verified: number;
  registered: number;
  waitlisted: number;
  pending: number;
  attended: number;
}

export interface WebinarDTO {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  language: string;
  organization_id: string | null;
  host: { id: string; name: string; logo_url: string | null } | null;
  flyer_url: string | null;
  banner_url: string | null;
  start_at: string | null;
  end_at: string | null;
  start_at_local: string | null;
  end_at_local: string | null;
  timezone: string;
  duration_mins: number;
  registration_open_at: string | null;
  registration_close_at: string | null;
  registration_open_at_local: string | null;
  registration_close_at_local: string | null;
  max_participants: number | null;
  allow_waitlist: boolean;
  is_free: boolean;
  price: number;
  currency: string;
  provider_type: string;
  meeting_url: string | null;
  meeting_link_public: boolean;
  faqs: { question: string; answer: string }[];
  email_settings: Record<string, boolean>;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  is_published: boolean;
  is_cancelled: boolean;
  status: string;
  counts: WebinarCounts;
  created_at?: string;
}

export interface WebinarFormPayload {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  category?: string | null;
  language?: string;
  organization_id?: string | null;
  start_at: string; // naive local "YYYY-MM-DDTHH:MM"
  end_at: string;
  timezone: string;
  registration_open_at?: string | null;
  registration_close_at?: string | null;
  max_participants?: number | null;
  allow_waitlist?: boolean;
  is_free?: boolean;
  price?: number;
  currency?: string;
  provider_type?: string;
  meeting_url?: string | null;
  meeting_link_public?: boolean;
  faqs?: { question: string; answer: string }[];
  email_settings?: Record<string, boolean>;
  meta_title?: string | null;
  meta_description?: string | null;
}

export async function listWebinars(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  published?: boolean;
} = {}) {
  const res = await api.get("/admin/webinars", { params });
  return res.data as {
    data: WebinarListItem[];
    meta: { page: number; limit: number; total: number; pages: number };
  };
}

export async function getWebinar(id: string) {
  const res = await api.get(`/admin/webinars/${id}`);
  return res.data.data as WebinarDTO;
}

export async function createWebinar(payload: WebinarFormPayload) {
  const res = await api.post("/admin/webinars", payload);
  return res.data.data as WebinarDTO;
}

export async function updateWebinar(id: string, payload: Partial<WebinarFormPayload>) {
  const res = await api.put(`/admin/webinars/${id}`, payload);
  return res.data.data as WebinarDTO;
}

export async function deleteWebinar(id: string) {
  await api.delete(`/admin/webinars/${id}`);
}

export async function publishWebinar(id: string) {
  const res = await api.post(`/admin/webinars/${id}/publish`);
  return res.data.data as WebinarDTO;
}

export async function unpublishWebinar(id: string) {
  const res = await api.post(`/admin/webinars/${id}/unpublish`);
  return res.data.data as WebinarDTO;
}

export async function cancelWebinar(id: string) {
  const res = await api.post(`/admin/webinars/${id}/cancel`);
  return res.data.data as WebinarDTO;
}

export async function uploadWebinarFlyer(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/admin/webinars/${id}/flyer`, fd);
  return res.data.data.flyer_url as string;
}

export async function uploadWebinarBanner(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/admin/webinars/${id}/banner`, fd);
  return res.data.data.banner_url as string;
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export interface RegistrationDTO {
  id: string;
  full_name: string;
  email: string;
  date_of_birth: string | null;
  gender: string | null;
  profession: string | null;
  status: string;
  verified_at: string | null;
  attendance_status: string;
  payment_status: string;
  created_at: string | null;
}

export async function listRegistrations(webinarId: string, params: { search?: string; status?: string } = {}) {
  const res = await api.get(`/admin/webinars/${webinarId}/registrations`, { params });
  return res.data as { data: RegistrationDTO[]; counts: WebinarCounts };
}

export async function updateRegistration(
  webinarId: string,
  regId: string,
  payload: { attendance_status?: string; status?: string }
) {
  const res = await api.patch(`/admin/webinars/${webinarId}/registrations/${regId}`, payload);
  return res.data.data as RegistrationDTO;
}

export async function deleteRegistration(webinarId: string, regId: string) {
  await api.delete(`/admin/webinars/${webinarId}/registrations/${regId}`);
}

export async function resendRegistrationEmail(webinarId: string, regId: string) {
  const res = await api.post(`/admin/webinars/${webinarId}/registrations/${regId}/resend`);
  return res.data as { success: boolean; message?: string };
}

export async function downloadRegistrationsCsv(webinarId: string, filename: string) {
  const res = await api.get(`/admin/webinars/${webinarId}/registrations/export`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Email campaigns
// ---------------------------------------------------------------------------

export interface CampaignDTO {
  id: string;
  subject: string;
  audience: string;
  status: string;
  sent_count: number;
  created_at: string | null;
  sent_at: string | null;
}

export async function listCampaigns(webinarId: string) {
  const res = await api.get(`/admin/webinars/${webinarId}/emails`);
  return res.data.data as CampaignDTO[];
}

export async function createCampaign(
  webinarId: string,
  payload: { subject: string; body: string; audience: string; recipient_ids?: string[] }
) {
  const res = await api.post(`/admin/webinars/${webinarId}/emails`, payload);
  return res.data.data as { id: string; status: string };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface WebinarReport {
  totals: { registrations: number; verified: number; attended: number };
  demographics: {
    gender: Record<string, number>;
    profession: Record<string, number>;
    age_group: Record<string, number>;
  };
  conversion: { verification_rate: number; attendance_rate: number };
}

export async function getWebinarReport(webinarId: string) {
  const res = await api.get(`/admin/webinars/${webinarId}/reports`);
  return res.data.data as WebinarReport;
}
