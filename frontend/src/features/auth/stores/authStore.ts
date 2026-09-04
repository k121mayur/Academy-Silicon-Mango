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
    if (typeof window !== "undefined") {
      if (u) {
        localStorage.setItem("sm_has_session", "1");
      } else {
        localStorage.removeItem("sm_has_session");
      }
    }
    set({ user: u, isInitialized: true });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<AuthUser | null>("/auth/me");
      const user = res.data && res.data.email ? res.data : null;
      if (typeof window !== "undefined") {
        if (user) {
          localStorage.setItem("sm_has_session", "1");
        } else {
          localStorage.removeItem("sm_has_session");
        }
      }
      set({ user, isInitialized: true, isLoading: false });
      return user;
    } catch (e) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("sm_has_session");
      }
      set({ user: null, isInitialized: true, isLoading: false });
      return null;
    }
  },

  logout: async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("sm_has_session");
    }
    try {
      await api.post("/auth/logout");
    } catch (e) {
      // ignore
    }
    set({ user: null });
  },

  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("sm_has_session");
    }
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
