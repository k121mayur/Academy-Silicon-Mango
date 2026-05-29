import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { ROUTES } from "@/router/routes";
import { queryClient } from "@/lib/queryClient";

interface NavItem {
  label: string;
  to: string;
  icon: string;
  /** When true, this item is gated until the profile is complete. */
  gated?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Account", items: [{ label: "Profile", to: ROUTES.student.profile, icon: "account_circle" }] },
  { title: "Discover", items: [{ label: "Explore Courses", to: ROUTES.student.explore, icon: "travel_explore", gated: true }] },
  { title: "Learning", items: [{ label: "My Courses", to: ROUTES.student.myCourses, icon: "school", gated: true }] },
];

const GATE_MESSAGE = "Complete your profile first so course recommendations can be personalised.";

export function StudentSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const profileComplete = useAuthStore((s) => s.user?.profile_complete ?? false);

  return (
    <aside className="w-64 h-full bg-surface-lowest border-r border-ink-outlineVariant/40 shadow-nav flex flex-col">
      <Link
        to={ROUTES.student.myCourses}
        className="flex items-center gap-2 px-5 py-4 border-b border-ink-outlineVariant/30"
      >
        <img src="/Logo1.png" alt="Silicon Mango" className="w-9 h-9 object-contain" />
        <div className="leading-tight">
          <p className="font-display font-extrabold text-title-md text-ink">Silicon Mango</p>
          <p className="text-label text-ink-outline">Student Portal</p>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin animate-fade-in">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="text-caption text-ink-outline px-3 mb-1">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const locked = !!item.gated && !profileComplete;
                const isProfile = item.to === ROUTES.student.profile;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={isProfile}
                      onClick={(e) => {
                        if (locked) {
                          e.preventDefault();
                          toast(GATE_MESSAGE, { icon: "🔒" });
                          navigate(ROUTES.student.profile);
                        }
                        onNavigate?.();
                      }}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 px-3 h-10 rounded-xl text-body-sm transition-colors",
                          isActive && !locked
                            ? "bg-primary-container/30 text-primary-onContainer font-semibold"
                            : "text-ink-variant hover:bg-surface-containerLow",
                          locked && "opacity-60 cursor-not-allowed"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && !locked && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-primary" />
                          )}
                          <span className="icon text-[20px]">{item.icon}</span>
                          <span className="flex-1">{item.label}</span>
                          {isProfile && !profileComplete && (
                            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" title="Profile incomplete" />
                          )}
                          {isProfile && profileComplete && (
                            <span className="icon text-[16px] text-success">check_circle</span>
                          )}
                          {locked && <span className="icon text-[16px] text-ink-outline">lock</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!profileComplete && (
        <div className="m-3 p-3 rounded-xl bg-primary-container/20 border border-primary-container/40">
          <p className="text-label text-primary-onContainer font-semibold">Finish setting up</p>
          <p className="text-label text-ink-variant mt-0.5">
            Complete your profile to explore courses and enroll.
          </p>
        </div>
      )}
    </aside>
  );
}

export function StudentTopBar({ onMenuClick }: { onMenuClick?: () => void }) {
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
          <p className="text-title-md font-display font-semibold text-ink">
            Welcome{user?.display_name ? `, ${user.display_name}` : ""}
          </p>
          <p className="text-label text-ink-outline">Your learning, all in one place</p>
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
                onClick={() => {
                  setOpen(false);
                  navigate(ROUTES.student.profile);
                }}
                className="w-full text-left px-3 py-2 text-body-sm text-ink hover:bg-surface-container flex items-center gap-2"
              >
                <span className="icon text-[18px]">account_circle</span>
                My profile
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate("/account/change-password");
                }}
                className="w-full text-left px-3 py-2 text-body-sm text-ink hover:bg-surface-container flex items-center gap-2"
              >
                <span className="icon text-[18px]">password</span>
                Change password
              </button>
              <button
                onClick={async () => {
                  queryClient.clear();
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
