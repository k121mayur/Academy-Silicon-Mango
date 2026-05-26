import api from "@/lib/api";
import type { AuthUser } from "@/types/auth";

export interface AuthApiResponse {
  user: AuthUser;
  profile_complete: boolean;
}

export async function login(email: string, password: string): Promise<AuthApiResponse> {
  console.log("[AUTH-SVC] login", email);
  const res = await api.post<AuthApiResponse>("/auth/login", { email, password });
  return res.data;
}

export async function requestSignupOtp(email: string): Promise<{ message: string; expires_in: number }> {
  console.log("[AUTH-SVC] requestSignupOtp", email);
  const res = await api.post("/auth/signup/request", { email });
  return res.data;
}

export async function verifySignup(payload: {
  email: string;
  otp: string;
  password: string;
  display_name: string;
}): Promise<AuthApiResponse> {
  console.log("[AUTH-SVC] verifySignup", payload.email);
  const res = await api.post<AuthApiResponse>("/auth/signup/verify", payload);
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me");
  return res.data;
}
