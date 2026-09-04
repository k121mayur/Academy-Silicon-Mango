import api from "@/lib/api";

export interface SubscriberDTO {
  id: string;
  email: string;
  is_active: boolean;
  source?: string | null;
  confirmed_at?: string | null;
  unsubscribed_at?: string | null;
  unsubscribe_reason?: string | null;
  created_at?: string | null;
}

export interface SubscriberStats {
  total: number;
  active: number;
  inactive: number;
}

export interface SubscriberListResponse {
  success: boolean;
  data: SubscriberDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  stats: SubscriberStats;
}

export interface ListSubscribersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export async function listSubscribers(params: ListSubscribersParams = {}): Promise<SubscriberListResponse> {
  const res = await api.get("/admin/subscribers", { params });
  return res.data;
}

export async function createSubscriber(payload: { email: string; source?: string }): Promise<SubscriberDTO> {
  const res = await api.post("/admin/subscribers", payload);
  return res.data.data;
}

export async function updateSubscriber(
  id: string,
  payload: { is_active?: boolean; source?: string }
): Promise<SubscriberDTO> {
  const res = await api.patch(`/admin/subscribers/${id}`, payload);
  return res.data.data;
}

export async function deleteSubscriber(id: string): Promise<void> {
  await api.delete(`/admin/subscribers/${id}`);
}

export async function exportSubscribersCsv(params: { search?: string; status?: string } = {}): Promise<void> {
  const res = await api.get("/admin/subscribers/export", { params, responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `email-subscribers-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export interface UnsubscribeStatusResponse {
  exists: boolean;
  is_active: boolean;
  email: string;
  unsubscribed_at?: string | null;
  token_valid?: boolean;
}

export async function checkUnsubscribeStatus(email: string, token?: string): Promise<UnsubscribeStatusResponse> {
  const res = await api.get("/public/unsubscribe/status", { params: { email, token } });
  return res.data.data;
}

export async function unsubscribeNewsletter(payload: {
  email: string;
  reason?: string;
  token?: string;
}): Promise<{ message: string; unsubscribed: boolean }> {
  const res = await api.post("/public/unsubscribe", payload);
  return res.data.data;
}
