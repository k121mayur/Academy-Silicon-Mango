import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";

interface NavItem {
  label: string;
  to: string;
  icon: string;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", to: "/admin/dashboard", icon: "space_dashboard" }],
  },
  {
    title: "Catalog",
    items: [
      { label: "Courses", to: "/admin/courses", icon: "menu_book" },
      { label: "Batches", to: "/admin/batches", icon: "groups_2" },
      { label: "Catalogue", to: "/admin/catalogue", icon: "auto_stories" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Instructors", to: "/admin/users/instructors", icon: "psychology" },
      { label: "Students", to: "/admin/users/students", icon: "school" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Enrollments", to: "/admin/enrollments", icon: "how_to_reg" },
      { label: "Batch Operations", to: "/admin/batch-ops", icon: "tune" },
    ],
  },
  {
    title: "Events",
    items: [{ label: "Webinars", to: "/admin/webinars", icon: "co_present" }],
  },
  {
    title: "Finances",
    items: [
      { label: "Payments", to: "/admin/payments", icon: "payments" },
      { label: "Payment Settings", to: "/admin/payment-settings", icon: "settings" },
    ],
  },
  {
    title: "Credentials",
    items: [{ label: "Certificates", to: "/admin/certificates", icon: "workspace_premium" }],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="w-64 h-full bg-surface-lowest border-r border-ink-outlineVariant/40 shadow-nav flex flex-col">
      <Link to="/admin/dashboard" className="flex items-center gap-2 px-5 py-4 border-b border-ink-outlineVariant/30">
        <img src="/Logo1.png" alt="Silicon Mango" className="w-9 h-9 object-contain" />
        <div className="leading-tight">
          <p className="font-display font-extrabold text-title-md text-ink">Silicon Mango</p>
          <p className="text-label text-ink-outline">Admin Console</p>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="text-caption text-ink-outline px-3 mb-1">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 h-10 rounded-xl text-body-sm transition-colors",
                        isActive
                          ? "bg-primary-container/30 text-primary-onContainer font-semibold"
                          : "text-ink-variant hover:bg-surface-containerLow"
                      )
                    }
                  >
                    <span className="icon text-[20px]">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="h-16 bg-surface-lowest border-b border-ink-outlineVariant/40 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden w-10 h-10 grid place-items-center rounded-md hover:bg-surface-container"
          >
            <span className="icon">menu</span>
          </button>
        )}
        <div>
          <p className="text-title-md font-display font-semibold text-ink">Welcome back{user?.display_name ? `, ${user.display_name}` : ""}</p>
          <p className="text-label text-ink-outline">Manage your academy operations</p>
        </div>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-surface-container"
        >
          <Avatar name={user?.display_name || user?.email} src={user?.avatar_url} size="sm" />
          <div className="hidden sm:block text-left">
            <p className="text-body-sm font-medium text-ink leading-tight">{user?.display_name || user?.email}</p>
            <p className="text-label text-ink-outline capitalize">{user?.role}</p>
          </div>
          <span className="icon text-ink-outline">expand_more</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute right-0 mt-2 w-52 bg-surface-lowest rounded-xl shadow-modal border border-ink-outlineVariant/40 py-1 z-40">
              <div className="px-3 py-2 border-b border-ink-outlineVariant/30">
                <p className="text-body-sm font-medium text-ink truncate">{user?.email}</p>
                <p className="text-label text-ink-outline capitalize">{user?.role}</p>
              </div>
              <button
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
                className="w-full text-left px-3 py-2 text-body-sm text-danger hover:bg-danger-container/40 flex items-center gap-2"
              >
                <span className="icon text-[18px]">logout</span>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
