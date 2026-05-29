import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/features/auth/stores/authStore";
import type { UserRole } from "@/types/auth";

interface ProtectedRouteProps {
  roles?: UserRole[];
  requireProfileComplete?: boolean;
}

export default function ProtectedRoute({ roles, requireProfileComplete }: ProtectedRouteProps) {
  const { user, isInitialized, isLoading, fetchMe } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (!isInitialized && !isLoading) {
      fetchMe();
    }
  }, [isInitialized, isLoading, fetchMe]);

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary-container border-t-primary animate-spin" />
          <p className="text-body-sm text-ink-variant">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log("[GUARD] No user — redirecting to /login");
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    console.log(`[GUARD] Wrong role (${user.role}) for ${location.pathname} — redirecting`);
    const target = user.role === "admin" ? "/admin/dashboard" : user.role === "instructor" ? "/instructor/dashboard" : "/portal/my-courses";
    return <Navigate to={target} replace />;
  }

  if (requireProfileComplete && user.role === "student" && !user.profile_complete) {
    if (location.pathname !== "/portal/profile") {
      console.log("[GUARD] Student profile incomplete — redirecting to /portal/profile");
      return <Navigate to="/portal/profile" replace />;
    }
  }

  return <Outlet />;
}
