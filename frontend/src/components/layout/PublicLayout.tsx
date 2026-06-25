import { Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { Button } from "@/components/ui/Button";
import { NewsletterSignup } from "@/components/public/NewsletterSignup";
import { RouteFallback } from "./RouteFallback";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Explore Courses", href: "/courses", route: "/courses", internal: true },
  { label: "Blogs", href: "/blog", route: "/blog", internal: true },
  { label: "About Us", href: "/#about", route: "/" },
  { label: "Contact", href: "mailto:palak@siliconmango.com", route: "/", external: true },
];

// LinkedIn's logo is no longer hosted by Simple Icons (brand-policy removal),
// so the CDN URL 404s — render it from an inline SVG instead.
const LINKEDIN_SVG =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

// Community / social links shown in the footer.
const SOCIAL_LINKS: {
  label: string;
  slug: string;
  href: string;
  svg?: string;
}[] = [
  {
    label: "WhatsApp community",
    slug: "whatsapp",
    href: "https://chat.whatsapp.com/D9Zjxrevph6Fb1GCRq8IJf",
  },
  { label: "Instagram", slug: "instagram", href: "https://www.instagram.com/siliconmango" },
  {
    label: "LinkedIn",
    slug: "linkedin",
    href: "https://www.linkedin.com/company/silicon-mango",
    svg: LINKEDIN_SVG,
  },
  { label: "YouTube", slug: "youtube", href: "https://www.youtube.com/@siliconmango" },
];

export default function PublicLayout() {
  const { user, isInitialized, isLoading, fetchMe } = useAuthStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Resolve the session once so public pages (e.g. course enrolment CTA) know
  // whether the visitor is already signed in, even on a direct page load.
  useEffect(() => {
    if (!isInitialized && !isLoading) fetchMe();
  }, [isInitialized, isLoading, fetchMe]);

  const dashHref =
    user?.role === "admin"
      ? "/admin/dashboard"
      : user?.role === "instructor"
      ? "/instructor/dashboard"
      : "/portal/my-courses";

  // Tighten the header (shadow + stronger blur) once the user scrolls past the hero edge.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on navigation and lock body scroll while it's open.
  useEffect(() => {
    setMenuOpen(false);
  }, [loc.pathname]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:bg-ink focus:text-surface focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to content
      </a>

      <header
        className={cn(
          "sticky top-0 z-40 transition-[box-shadow,background-color,backdrop-filter] duration-300 ease-out",
          scrolled
            ? "glass shadow-card border-b border-ink-outlineVariant/30"
            : "bg-surface/60 backdrop-blur-sm border-b border-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 group press shrink-0">
            <img
              src="/Logo1.png"
              alt="Silicon Mango"
              width={36}
              height={36}
              className="w-9 h-9 object-contain transition-transform duration-300 ease-spring group-hover:rotate-[-6deg] group-hover:scale-110"
            />
            <span className="font-display font-extrabold text-title-md text-ink">Silicon Mango</span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 text-body-sm">
            {NAV_LINKS.map((l) => {
              const active = l.internal && loc.pathname.startsWith(l.route) && l.route !== "/";
              if (l.internal) {
                return (
                  <Link
                    key={l.label}
                    to={l.href}
                    className={cn(
                      "px-3 py-2 rounded-lg transition-colors duration-200 ease-out whitespace-nowrap",
                      active
                        ? "text-ink font-semibold bg-surface-container"
                        : "text-ink-variant hover:text-ink hover:bg-surface-container/70"
                    )}
                  >
                    {l.label}
                  </Link>
                );
              }
              return (
                <a
                  key={l.label}
                  href={l.href}
                  {...(l.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="px-3 py-2 rounded-lg text-ink-variant hover:text-ink hover:bg-surface-container/70 transition-colors duration-200 ease-out whitespace-nowrap"
                >
                  {l.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <Button onClick={() => nav(dashHref)} size="sm" rightIcon="arrow_forward" className="hidden sm:inline-flex">
                Go to Dashboard
              </Button>
            ) : (
              <>
                {/* Webinar pill — low-commitment CTA next to the primary enrol button */}
                {loc.pathname !== "/webinars" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => nav("/webinars")}
                    className="hidden lg:inline-flex border border-ink-outlineVariant/60"
                  >
                    Webinars
                  </Button>
                )}
                {loc.pathname !== "/login" && (
                  <Button variant="ghost" size="sm" onClick={() => nav("/login")} className="hidden sm:inline-flex">
                    Sign In
                  </Button>
                )}
                {loc.pathname !== "/signup" && (
                  <Button size="sm" onClick={() => nav("/signup")} className="hidden sm:inline-flex">
                    Get Started
                  </Button>
                )}
              </>
            )}
            <button
              className="md:hidden w-10 h-10 grid place-items-center rounded-lg text-ink hover:bg-surface-container press"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="icon">{menuOpen ? "close" : "menu"}</span>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-ink-outlineVariant/30 glass animate-slide-up">
            <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((l) =>
                l.internal ? (
                  <Link
                    key={l.label}
                    to={l.href}
                    className="px-3 py-3 rounded-lg text-body-lg text-ink-variant hover:bg-surface-container"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.label}
                    href={l.href}
                    className="px-3 py-3 rounded-lg text-body-lg text-ink-variant hover:bg-surface-container"
                  >
                    {l.label}
                  </a>
                )
              )}
              <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-ink-outlineVariant/30">
                {user ? (
                  <Button onClick={() => nav(dashHref)} fullWidth rightIcon="arrow_forward">
                    Go to Dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" fullWidth onClick={() => nav("/login")}>
                      Sign In
                    </Button>
                    <Button fullWidth onClick={() => nav("/signup")} rightIcon="arrow_forward">
                      Enroll Now
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="bg-ink text-surface-containerHigh mt-16 relative overflow-hidden">
        {/* Brand glow bleeding in from the top edge */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[640px] h-48 bg-primary-container/20 blur-[80px] pointer-events-none" />

        {/* Newsletter band — double opt-in (email → OTP → subscribed) */}
        <div className="border-b border-white/10 relative">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-md">
              <h3 className="font-display font-bold text-title-lg text-white">Subscribe to our newsletter</h3>
              <p className="text-body-sm text-surface-containerHigh/70 mt-1">
                New batches, course drops, and learning tips — straight to your inbox. No spam.
              </p>
            </div>
            <NewsletterSignup />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 relative">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <img src="/Logo1.png" alt="Silicon Mango" width={32} height={32} className="w-8 h-8 object-contain" />
              <span className="font-display font-extrabold">Silicon Mango</span>
            </div>
            <p className="text-body-sm text-surface-containerHigh/70 max-w-xs">
              Affordable, job-ready courses in Excel, Python, SQL, and AI, built for working
              professionals across India.
            </p>
            <div className="flex items-center gap-2.5 mt-5">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.slug}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors press"
                >
                  {s.svg ? (
                    <svg
                      viewBox="0 0 24 24"
                      width={16}
                      height={16}
                      fill="currentColor"
                      aria-hidden
                      className="w-4 h-4 opacity-90 text-white"
                    >
                      <path d={s.svg} />
                    </svg>
                  ) : (
                    <img
                      src={`https://cdn.simpleicons.org/${s.slug}/ffffff`}
                      alt=""
                      width={16}
                      height={16}
                      className="w-4 h-4 opacity-90"
                      loading="lazy"
                    />
                  )}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Learn</p>
            <ul className="space-y-2.5 text-body-sm">
              <li><Link to="/courses" className="text-surface-containerHigh/80 hover:text-white transition-colors">Courses</Link></li>
              <li><Link to="/webinars" className="text-surface-containerHigh/80 hover:text-white transition-colors">Live Classes</Link></li>
              <li><Link to="/courses" className="text-surface-containerHigh/80 hover:text-white transition-colors">Self-paced</Link></li>
              <li><Link to="/webinars" className="text-surface-containerHigh/80 hover:text-white transition-colors">Webinars</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Company</p>
            <ul className="space-y-2.5 text-body-sm">
              <li><a href="/#about" className="text-surface-containerHigh/80 hover:text-white transition-colors">About</a></li>
              <li><Link to="/blog" className="text-surface-containerHigh/80 hover:text-white transition-colors">Blog</Link></li>
              <li><a href="mailto:careers@siliconmango.com" className="text-surface-containerHigh/80 hover:text-white transition-colors">Careers</a></li>
            </ul>
          </div>
          <div>
            <p className="text-label uppercase tracking-wider text-surface-containerHigh/60 mb-3">Support</p>
            <ul className="space-y-2.5 text-body-sm">
              <li><a href="mailto:palak@siliconmango.com" className="text-surface-containerHigh/80 hover:text-white transition-colors">palak@siliconmango.com</a></li>
              <li><a href="tel:+918446359728" className="text-surface-containerHigh/80 hover:text-white transition-colors">+91 84463 59728</a></li>
              <li>
                <a href="https://chat.whatsapp.com/D9Zjxrevph6Fb1GCRq8IJf" target="_blank" rel="noreferrer" className="text-surface-containerHigh/80 hover:text-white transition-colors">WhatsApp Community</a>
              </li>
              <li><a href="/#faq" className="text-surface-containerHigh/80 hover:text-white transition-colors">FAQs</a></li>
              <li><Link to="/login" className="text-surface-containerHigh/80 hover:text-white transition-colors">Sign In</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 relative">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-label text-surface-containerHigh/60">
            <p>© {new Date().getFullYear()} Silicon Mango. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
