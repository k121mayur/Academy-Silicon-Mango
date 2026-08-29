import api from "@/lib/api";

export interface ReviewCommentDTO {
  id: string;
  review_id: string;
  user_id: string | null;
  user_name: string;
  user_role: "admin" | "instructor" | string;
  comment_text: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface ReviewDTO {
  id: string;
  rating: number;
  name: string;
  designation: string;
  company_or_institution: string;
  review_text: string;
  user_id: string | null;
  is_approved: boolean;
  created_at: string | null;
  updated_at: string | null;
  comments: ReviewCommentDTO[];
}

export interface ReviewStatsDTO {
  total_reviews: number;
  average_rating: number;
  star_counts: Record<string, number>;
}

export interface ReviewFormPayload {
  rating: number;
  name: string;
  designation: string;
  company_or_institution: string;
  review_text: string;
}

export interface CommentFormPayload {
  comment_text: string;
}

export interface ReviewsResponse {
  success: boolean;
  data: ReviewDTO[];
  stats: ReviewStatsDTO;
  meta: { page: number; limit: number; total: number; pages: number };
}

// ───────────────────────── Public ─────────────────────────

export async function listPublicReviews(params: {
  rating?: number;
  search?: string;
  page?: number;
  limit?: number;
} = {}) {
  const res = await api.get<ReviewsResponse>("/public/reviews", { params });
  return res.data;
}

export async function submitReview(payload: ReviewFormPayload) {
  const res = await api.post<ReviewDTO>("/public/reviews", payload);
  return res.data;
}

export async function addReviewComment(reviewId: string, payload: CommentFormPayload) {
  const res = await api.post<ReviewCommentDTO>(`/public/reviews/${reviewId}/comments`, payload);
  return res.data;
}

export async function deleteReviewComment(reviewId: string, commentId: string) {
  const res = await api.delete(`/public/reviews/${reviewId}/comments/${commentId}`);
  return res.data;
}

// ───────────────────────── Admin ─────────────────────────

export async function listAdminReviews(params: {
  page?: number;
  limit?: number;
  rating?: number;
  search?: string;
} = {}) {
  const res = await api.get<ReviewsResponse>("/admin/reviews", { params });
  return res.data;
}

export async function deleteAdminReview(reviewId: string) {
  const res = await api.delete(`/admin/reviews/${reviewId}`);
  return res.data;
}
