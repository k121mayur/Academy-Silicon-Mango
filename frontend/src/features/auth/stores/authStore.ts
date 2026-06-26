import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { AuthUser } from "@/types/auth";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  setUser: (u: AuthUser | null) => void;
  fetchMe: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,

  setUser: (u) => {
    console.log("[AUTH] setUser", u?.email || "null");
    set({ user: u, isInitialized: true });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<AuthUser>("/auth/me");
      console.log("[AUTH] /me OK", res.data.email);
      set({ user: res.data, isInitialized: true, isLoading: false });
      return res.data;
    } catch (e) {
      console.log("[AUTH] /me failed (not authenticated)");
      set({ user: null, isInitialized: true, isLoading: false });
      return null;
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
      console.log("[AUTH] Logout OK");
    } catch (e) {
      console.warn("[AUTH] Logout request failed (ignoring)");
    }
    set({ user: null });
  },

  clearAuth: () => {
    console.log("[AUTH] clearAuth — session ended");
    set({ user: null });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("auth:logout", () => {
    // Only tell the user their session expired if they actually had one — a guest's
    // session-probe 401 also lands here, and shouldn't pop a "session expired" toast.
    const hadSession = !!useAuthStore.getState().user;
    console.warn("[AUTH] Got auth:logout event — clearing state");
    useAuthStore.getState().clearAuth();
    if (hadSession) {
      toast.error("Your session has expired — please sign in again.");
    }
  });
}
