import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, TopBar } from "./AdminChrome";
import { RouteFallback } from "./RouteFallback";

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:block sticky top-0 h-screen">
        <Sidebar />
      </div>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
