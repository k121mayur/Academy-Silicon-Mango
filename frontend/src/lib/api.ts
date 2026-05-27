import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8085"}/api/v1`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new Event("auth:logout"));
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
