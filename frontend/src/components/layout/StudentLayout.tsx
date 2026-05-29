import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { StudentSidebar, StudentTopBar } from "./StudentChrome";
import { StudentErrorBoundary } from "@/components/student/StudentErrorBoundary";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Spinner } from "@/components/ui/Spinner";

function RouteFallback() {
  return (
    <div className="min-h-[50vh] grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-outline">
        <Spinner size={28} className="text-primary" />
        <p className="text-body-sm">Loading…</p>
      </div>
    </div>
  );
}

export default function StudentLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const online = useOnlineStatus();

  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:block sticky top-0 h-screen">
        <StudentSidebar />
      </div>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full">
            <StudentSidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <StudentTopBar onMenuClick={() => setDrawerOpen(true)} />
        {!online && (
          <div className="bg-primary-container/40 text-primary-onContainer text-label font-medium text-center py-1.5 px-4 flex items-center justify-center gap-1.5">
            <span className="icon text-[14px]">cloud_off</span>
            You're offline — showing saved data. We'll refresh when you're back.
          </div>
        )}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <StudentErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </StudentErrorBoundary>
        </main>
      </div>
    </div>
  );
}
