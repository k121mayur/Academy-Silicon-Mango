import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export const API_V1_BASE_URL = API_BASE_URL.endsWith("/api/v1")
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

export function apiUrl(path: string): string {
  return `${API_V1_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function absoluteApiUrl(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

const api = axios.create({
  baseURL: API_V1_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// Holds the in-flight refresh promise so concurrent 401s share a single refresh call.
let refreshingPromise: Promise<void> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh on 401, once per request, and never for the refresh endpoint itself.
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes("/auth/refresh")
    ) {
      original._retry = true;

      if (!refreshingPromise) {
        refreshingPromise = api
          .post("/auth/refresh")
          .then(() => {
            refreshingPromise = null;
          })
          .catch(() => {
            refreshingPromise = null;
            // Refresh token expired or invalid — force logout.
            window.dispatchEvent(new Event("auth:logout"));
          });
      }

      try {
        await refreshingPromise;
        // Retry the original request with the new access-token cookie.
        return api(original);
      } catch {
        return Promise.reject(err);
      }
    }

    return Promise.reject(err);
  }
);

export default api;

export function extractErrorCode(err: unknown): string | null {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    return (data?.error_code as string) ?? (data?.code as string) ?? null;
  }
  return null;
}

export function extractErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    const nested = data?.error as Record<string, unknown> | undefined;
    return (nested?.message as string) ?? (data?.message as string) ?? (data?.detail as string) ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
