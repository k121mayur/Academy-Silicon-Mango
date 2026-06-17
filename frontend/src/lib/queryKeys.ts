// Centralised, typed React Query key factory. One place to avoid key drift.
export const qk = {
  student: {
    profile: () => ["student", "profile"] as const,
    batches: () => ["student", "batches"] as const,
    progress: (batchId: string) => ["student", "batch", batchId, "progress"] as const,
    attendance: (batchId: string) => ["student", "batch", batchId, "attendance"] as const,
    sessions: (batchId: string) => ["student", "batch", batchId, "sessions"] as const,
    assignments: (batchId: string) => ["student", "batch", batchId, "assignments"] as const,
    certificates: () => ["student", "certificates"] as const,
  },
  public: {
    courses: (search?: string) => ["public", "courses", search ?? ""] as const,
    course: (id: string) => ["public", "course", id] as const,
    courseBatches: (id: string) => ["public", "course", id, "batches"] as const,
    webinars: (status?: string, search?: string) =>
      ["public", "webinars", status ?? "", search ?? ""] as const,
    webinar: (idOrSlug: string) => ["public", "webinar", idOrSlug] as const,
    blogs: (search?: string) => ["public", "blogs", search ?? ""] as const,
    blog: (idOrSlug: string) => ["public", "blog", idOrSlug] as const,
  },
  admin: {
    blogs: (search?: string, status?: string) => ["admin", "blogs", search ?? "", status ?? ""] as const,
    blog: (id: string) => ["admin", "blog", id] as const,
  },
} as const;
