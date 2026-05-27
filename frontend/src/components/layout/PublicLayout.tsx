import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { Button } from "@/components/ui/Button";

export default function PublicLayout() {
  const { user } = useAuthStore();
  const nav = useNavigate();
  const loc = useLocation();

  const dashHref =
    user?.role === "admin"
      ? "/admin/dashboard"
      : user?.role === "instructor"
      ? "/instructor/dashboard"
      : "/portal/dashboard";

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-surface/80 border-b border-ink-outlineVariant/30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/Logo1.png" alt="Silicon Mango" className="w-9 h-9 object-contain" />
            <span className="font-display font-extrabold text-title-md text-ink">Silicon Mango</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-body-sm text-ink-variant">
            <a href="/#courses" className="hover:text-ink">Courses</a>
            <a href="/#instructors" className="hover:text-ink">Instructors</a>
            <a href="/#how-it-works" className="hover:text-ink">How it works</a>
            <a href="/#about" className="hover:text-ink">About</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button onClick={() => nav(dashHref)} size="sm">
                Go to Dashboard
              </Button>
            ) : (
              <>
                {loc.pathname !== "/login" && (
                  <Button variant="ghost" size="sm" onClick={() => nav("/login")}>
                    Sign In
                  </Button>
                )}
                {loc.pathname !== "/signup" && (
                  <Button size="sm" onClick={() => nav("/signup")}>
                    Get Started
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-ink text-surface-containerHigh mt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/Logo1.png" alt="Silicon Mango" className="w-8 h-8 object-contain" />
              <span className="font-display font-extrabold">Silicon Mango</span>
            </div>
            <p className="text-body-sm text-surface-containerHigh/70">Learn. Build. Get Certified.</p>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Courses</p>
            <ul className="space-y-2 text-body-sm">
              <li><a href="/#courses" className="hover:text-white">Live cohorts</a></li>
              <li><a href="/#courses" className="hover:text-white">Self-paced</a></li>
            </ul>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Company</p>
            <ul className="space-y-2 text-body-sm">
              <li><a href="/#about" className="hover:text-white">About</a></li>
              <li><a href="/#instructors" className="hover:text-white">Instructors</a></li>
            </ul>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Support</p>
            <ul className="space-y-2 text-body-sm">
              <li><a href="mailto:hello@siliconmango.com" className="hover:text-white">Contact</a></li>
              <li><a href="/login" className="hover:text-white">Sign In</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between text-label text-surface-containerHigh/60">
            <p>© {new Date().getFullYear()} Silicon Mango Academy. All rights reserved.</p>
            <div className="flex gap-4 mt-2 md:mt-0">
              <a href="#" className="hover:text-white">Privacy</a>
              <a href="#" className="hover:text-white">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
