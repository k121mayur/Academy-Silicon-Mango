import { create } from "zustand";
import { uploadVideo, type VideoDTO } from "@/services/video.service";

export type UploadStatus = "uploading" | "done" | "error";

export interface ActiveUpload {
  sessionId: string;
  fileName: string;
  title: string;
  progress: number; // 0..1
  eta: number | null; // seconds remaining (rough)
  status: UploadStatus;
  error?: string;
  video?: VideoDTO;
}

interface VideoUploadState {
  /** One in-flight (or just-finished) upload per session, keyed by sessionId. */
  uploads: Record<string, ActiveUpload>;
  /** Kick off an upload. No-op if one is already in flight for this session. */
  start: (sessionId: string, file: File, title: string) => void;
  /** Forget a session's upload entry (after the parent has handled done/error). */
  clear: (sessionId: string) => void;
}

/**
 * Video uploads live here — NOT inside the upload component — so an in-progress
 * upload keeps running and stays visible when the instructor closes and reopens
 * the "Add resource" dialog. It also blocks starting a second upload for the same
 * session until the current one finishes.
 */
export const useVideoUploadStore = create<VideoUploadState>((set, get) => ({
  uploads: {},

  start: (sessionId, file, title) => {
    const existing = get().uploads[sessionId];
    if (existing && existing.status === "uploading") return; // already uploading

    set((s) => ({
      uploads: {
        ...s.uploads,
        [sessionId]: {
          sessionId,
          fileName: file.name,
          title,
          progress: 0,
          eta: null,
          status: "uploading",
        },
      },
    }));

    const startedAt = Date.now();
    const patch = (p: Partial<ActiveUpload>) =>
      set((s) => {
        const cur = s.uploads[sessionId];
        if (!cur) return s;
        return { uploads: { ...s.uploads, [sessionId]: { ...cur, ...p } } };
      });

    uploadVideo(sessionId, file, title, ({ progress, loaded, total }) => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const eta = loaded > 0 ? (elapsed / loaded) * (total - loaded) : null;
      patch({ progress, eta });
    })
      .then((video) => patch({ status: "done", progress: 1, eta: 0, video }))
      .catch((e) => patch({ status: "error", error: e?.message || "Upload failed" }));
  },

  clear: (sessionId) =>
    set((s) => {
      const next = { ...s.uploads };
      delete next[sessionId];
      return { uploads: next };
    }),
}));
