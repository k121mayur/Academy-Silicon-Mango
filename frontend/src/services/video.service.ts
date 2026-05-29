import api from "@/lib/api";

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8085"}/api/v1`;

export type VideoStatus = "uploaded" | "queued" | "processing" | "ready" | "failed";

export interface VideoDTO {
  id: string;
  session_resource_id: string;
  original_filename: string;
  original_size_bytes: number;
  duration_seconds: number | null;
  source_height: number | null;
  status: VideoStatus;
  error_message: string | null;
  processed_at: string | null;
  created_at: string | null;
}

export interface PlaybackInfo {
  status: VideoStatus;
  video_id: string;
  duration_seconds: number | null;
  manifest_url: string;
  expires_in: number;
  watermark_email: string;
  watermark_name?: string | null;
}

export interface PendingPlayback {
  status: VideoStatus;
  message: string;
}

/** Upload one video to /instructor/sessions/{sessionId}/videos.
 *  Uses raw XMLHttpRequest so we get reliable upload.onprogress events. */
export function uploadVideo(
  sessionId: string,
  file: File,
  title: string,
  onProgress?: (info: { progress: number; loaded: number; total: number }) => void,
): Promise<VideoDTO> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("title", title);
    form.append("file", file);

    xhr.open("POST", `${API_BASE}/instructor/sessions/${sessionId}/videos`, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          progress: e.loaded / e.total,
          loaded: e.loaded,
          total: e.total,
        });
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && body.success) {
          resolve(body.data as VideoDTO);
        } else {
          const msg = body?.error?.message || body?.message || `Upload failed (${xhr.status})`;
          reject(new Error(msg));
        }
      } catch (e) {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.send(form);
  });
}

export async function fetchVideoStatus(videoId: string): Promise<VideoDTO> {
  const res = await api.get(`/instructor/videos/${videoId}`);
  return res.data.data as VideoDTO;
}

export async function deleteVideo(videoId: string): Promise<void> {
  await api.delete(`/instructor/videos/${videoId}`);
}

export async function retryVideo(videoId: string): Promise<VideoDTO> {
  const res = await api.post(`/instructor/videos/${videoId}/retry`);
  return res.data.data as VideoDTO;
}

/** Returns playback info if ready, or { status, message } when pending optimization. */
export async function fetchPlaybackInfo(videoId: string): Promise<PlaybackInfo | PendingPlayback> {
  try {
    const res = await api.get(`/student/videos/${videoId}/playback-info`);
    return res.data.data as PlaybackInfo;
  } catch (e: any) {
    // 425 Too Early: still optimizing
    const status = e?.response?.status;
    if (status === 425) {
      const d = e.response?.data?.data;
      if (d) return d as PendingPlayback;
    }
    throw e;
  }
}
