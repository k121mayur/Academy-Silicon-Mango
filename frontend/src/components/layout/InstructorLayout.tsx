import { useState } from "react";
import { Outlet } from "react-router-dom";
import { InstructorSidebar, InstructorTopBar } from "./InstructorChrome";

export default function InstructorLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <div className="min-h-screen bg-surface flex">
      <div className="hidden lg:block sticky top-0 h-screen">
        <InstructorSidebar />
      </div>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full">
            <InstructorSidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <InstructorTopBar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
