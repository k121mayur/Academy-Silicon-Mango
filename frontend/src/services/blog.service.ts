import api from "@/lib/api";

export interface BlogDTO {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  author: string;
  tags: string[];
  thumbnail_url: string | null;
  status: "draft" | "published";
  is_published: boolean;
  view_count: number;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
}

export interface BlogCardDTO {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  author: string;
  tags: string[];
  thumbnail_url: string | null;
  published_at: string | null;
  view_count: number;
}

export interface BlogDetailDTO extends BlogCardDTO {
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface BlogFormPayload {
  title: string;
  content: string;
  excerpt?: string | null;
  author: string;
  tags: string[];
  thumbnail_url?: string | null;
  is_published: boolean;
}

export interface PaginatedBlogs {
  success: boolean;
  data: BlogDTO[];
  meta: { page: number; limit: number; total: number; pages: number };
}

// ───────────────────────── Admin ─────────────────────────

export async function listBlogs(params: { page?: number; limit?: number; search?: string; status?: string } = {}) {
  const res = await api.get<PaginatedBlogs>("/admin/blogs", { params });
  return res.data;
}

export async function getBlog(id: string) {
  const res = await api.get(`/admin/blogs/${id}`);
  return res.data as BlogDTO;
}

export async function createBlog(payload: BlogFormPayload) {
  const res = await api.post("/admin/blogs", payload);
  return res.data as BlogDTO;
}

export async function updateBlog(id: string, payload: Partial<BlogFormPayload>) {
  const res = await api.put(`/admin/blogs/${id}`, payload);
  return res.data as BlogDTO;
}

export async function deleteBlog(id: string) {
  await api.delete(`/admin/blogs/${id}`);
}

export async function togglePublishBlog(id: string) {
  const res = await api.patch(`/admin/blogs/${id}/publish`);
  return res.data as BlogDTO;
}

/** Uploads an image (thumbnail or inline editor image); returns the stored URL. */
export async function uploadBlogImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post("/admin/blogs/upload-image", fd);
  return res.data.data.url as string;
}

// ───────────────────────── Public ─────────────────────────

export async function listPublicBlogs(search?: string) {
  const res = await api.get("/public/blogs", {
    params: search && search.trim() ? { search: search.trim() } : undefined,
  });
  return res.data.data as BlogCardDTO[];
}

export async function getPublicBlog(idOrSlug: string) {
  const res = await api.get(`/public/blogs/${idOrSlug}`);
  return res.data.data as BlogDetailDTO;
}
