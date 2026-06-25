import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Img } from "@/components/ui/Img";
import { FloatingWhatsApp } from "@/components/public/FloatingWhatsApp";
import { formatCurrency } from "@/lib/utils";
import { DEMO_YOUTUBE_URL } from "@/lib/media";

interface PublicCourse {
  id: string;
  title: string;
  slug: string;
  description?: string;
  category?: string;
  course_type: string;
  duration_unit: string;
  duration_value: number;
  price: number;
  discount: number;
  banner_url?: string;
  tags?: string[];
}

// Warm-toned learning photo for the full-bleed hero. If it fails to load the
// brand gradient underneath shows through (see onError below).
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=80";

// Shown as Card 1 in the course section when the API returns no published courses.
const EXCEL_FALLBACK: PublicCourse = {
  id: "excel-mastery",
  slug: "",
  title: "Excel Mastery: Beginner to Pro",
  description: "Go from zero to dashboards in 7 weeks of live, mentor-led classes designed for working professionals.",
  category: "Live cohort",
  course_type: "live",
  duration_unit: "weeks",
  duration_value: 7,
  price: 399,
  discount: 0,
};

export default function Landing() {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    api
      .get("/public/courses?limit=6")
      .then((res) => setCourses(res.data?.data || []))
      .catch((e) => console.warn("[LANDING] Failed to load courses", e))
      .finally(() => setLoadingCourses(false));
  }, []);

  // Surface the live Excel Mastery course from the API if it exists.
  const liveCourse =
    courses.find(
      (c) => c.title.toLowerCase().includes("excel") || c.slug.includes("excel")
    ) ?? (courses[0] || null);

  const displayCourse = liveCourse ?? EXCEL_FALLBACK;

  return (
    <div className="bg-surface overflow-x-clip">
      {/* ───────────────────── Hero (full-bleed image) ───────────────────── */}
      <section className="relative isolate flex items-center justify-center min-h-[88dvh] overflow-hidden">
        {/* Brand gradient base — always renders, even before/without the photo */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#5c3800] via-[#a85f00] to-[#3d2b00]"
          aria-hidden
        />
        {/* Curated warm photo */}
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        {/* Readability scrim — warm mango-tinted, darker at the edges */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#2a1c00]/85 via-[#3d2b00]/55 to-[#2a1c00]/80"
          aria-hidden
        />
        <div className="absolute inset-0 grid-pattern opacity-20 pointer-events-none" aria-hidden />

        {/* Centered overlay content */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 md:px-6 py-24 text-center text-white">
          {/* Trust strip */}
          <div
            className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-body-sm mb-6 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 animate-slide-up"
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <FilledStars count={5} size={14} className="text-primary-fill" />
              4.9 avg rating
            </span>
            <span className="text-white/40 hidden sm:inline">·</span>
            <span className="text-white/85 hidden sm:inline">300+ students enrolled</span>
            <span className="text-white/40 hidden md:inline">·</span>
            <span className="text-white/85 hidden md:inline">Certificate recognised by employers</span>
          </div>

          <h1
            className="font-display font-extrabold text-display-lg md:text-display-xl text-white leading-[1.05] animate-slide-up text-balance"
            style={{ animationDelay: "60ms", textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}
          >
            Learn skills and get a boost{" "}
            <span className="text-gradient-mango animate-gradient-pan">in your career.</span>
          </h1>

          <p
            className="text-body-lg text-white/85 max-w-xl mx-auto mt-5 animate-slide-up"
            style={{ animationDelay: "120ms" }}
          >
            Live instructor-led batches, weekly assignments, mentor feedback, and a verifiable
            certificate - everything at a fraction of the price.
          </p>

          <div
            className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center pt-8 animate-slide-up"
            style={{ animationDelay: "180ms" }}
          >
            <Link to="/signup">
              <Button size="lg" rightIcon="arrow_forward" className="shadow-glow w-full sm:w-auto">
                Enroll Now
              </Button>
            </Link>
            <a href={DEMO_YOUTUBE_URL} target="_blank" rel="noreferrer">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl text-title-md font-medium text-white bg-white/10 hover:bg-white/20 border border-white/25 backdrop-blur-md transition-all duration-200 ease-out active:scale-[0.98] w-full sm:w-auto"
              >
                <span className="icon text-[20px]">play_circle</span>
                Watch the demo
              </button>
            </a>
          </div>
        </div>

        {/* Scroll cue */}
        <a
          href="#courses"
          aria-label="Scroll to courses"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 grid place-items-center w-10 h-10 rounded-full text-white/70 hover:text-white animate-float"
        >
          <span className="icon text-[28px]">keyboard_arrow_down</span>
        </a>
      </section>

      {/* ─────────── Value pillars (floating card over hero edge) ─────────── */}
      <section className="relative z-20 max-w-6xl mx-auto px-4 md:px-6 -mt-14 md:-mt-20">
        <div className="bg-surface-lowest rounded-3xl shadow-card-hover border border-ink-outlineVariant/30 p-6 md:p-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-7">
          {[
            {
              icon: "target",
              title: "Job-ready curriculum",
              desc: "Designed by working data professionals around what employers actually test for.",
            },
            {
              icon: "support_agent",
              title: "Weekly live doubt-clearing",
              desc: "Live sessions included every week - ask anything, get unblocked fast.",
            },
            {
              icon: "rate_review",
              title: "Mentor-reviewed assignments",
              desc: "Real feedback on every submission, not just an auto-graded score.",
            },
            {
              icon: "verified",
              title: "Certificate with unique ID",
              desc: "A public URL you can share on LinkedIn and verify in one click.",
            },
          ].map((p, i) => (
            <Reveal key={p.title} delay={i * 70} className="flex gap-3.5">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-primary-container/30 text-primary-onContainer shrink-0">
                <span className="icon">{p.icon}</span>
              </span>
              <div className="min-w-0">
                <p className="font-display font-semibold text-title-md text-ink">{p.title}</p>
                <p className="text-body-sm text-ink-variant mt-0.5">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─────────────────── Featured courses ─────────────────── */}
      <section id="courses" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="flex flex-wrap items-end justify-between mb-10 gap-4">
            <div className="max-w-xl">
              <p className="text-caption text-primary mb-2">CATALOG</p>
              <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
                Build skills employers actually pay for
              </h2>
            </div>
            <Link
              to="/courses"
              className="text-body-sm text-primary font-semibold hover:underline hidden md:flex items-center gap-1 shrink-0"
            >
              View all courses <span className="icon text-[18px]">arrow_forward</span>
            </Link>
          </Reveal>

          {loadingCourses ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
              <Reveal as="article" className="h-full">
                <ExcelCourseCard course={displayCourse} />
              </Reveal>
              <Reveal delay={70} as="article" className="h-full">
                <PythonComingSoon />
              </Reveal>
              <Reveal delay={140} as="article" className="h-full">
                <RoadmapTeaserCard />
              </Reveal>
            </div>
          )}

          <div className="mt-6 md:hidden">
            <Link to="/courses">
              <Button variant="outline" fullWidth rightIcon="arrow_forward">
                View all courses
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────── Why Silicon Mango ─────────────────── */}
      <section id="about" className="py-16 md:py-24 bg-surface-containerLow scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="max-w-2xl mb-10">
            <p className="text-caption text-primary mb-2">WHY SILICON MANGO</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
              We built this for people who are serious, and busy.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {/* Wide feature cell — warm espresso→mango gradient (on-brand, light-theme safe) */}
            <Reveal className="md:col-span-2 md:row-span-2">
              <div className="h-full bg-gradient-to-br from-[#3d2b00] via-[#7a4a00] to-[#a85f00] text-white rounded-3xl p-8 relative overflow-hidden min-h-[220px]">
                <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-primary-fill/20 blur-3xl" />
                <div className="absolute inset-0 grid-pattern opacity-20" />
                <div className="relative">
                  <span className="grid place-items-center w-12 h-12 rounded-xl bg-primary-fill text-primary-on mb-4">
                    <span className="icon">smart_display</span>
                  </span>
                  <h3 className="font-display font-bold text-headline mb-2">Learn on your schedule</h3>
                  <p className="text-body-sm text-white/80 max-w-md">
                    Video lessons play smoothly even on mobile data. Resume any time, on any device.
                    Miss a live class? The recording is up the same day.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {["Mobile-data friendly", "Resume anywhere", "Recordings included"].map((t) => (
                      <span
                        key={t}
                        className="text-label px-2.5 py-1 rounded-full bg-white/12 text-white/90 border border-white/10"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            {[
              {
                icon: "groups_2",
                title: "Live cohorts + self-paced",
                desc: "Join a batch for accountability, or learn solo at your own pace. You choose.",
              },
              {
                icon: "rate_review",
                title: "Real feedback, not bots",
                desc: "Your assignments are reviewed by a mentor - with comments, not just a score.",
              },
              {
                icon: "workspace_premium",
                title: "A certificate that means something",
                desc: "Every certificate has a unique ID and a public URL. Employers can verify it in seconds.",
              },
              {
                icon: "wifi",
                title: "Works on 4G, even 3G",
                desc: "Lightweight design means no buffering on patchy connections or budget phones.",
              },
            ].map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <div className="h-full bg-surface-lowest rounded-3xl p-6 border border-ink-outlineVariant/40 hover-lift hover:shadow-card-hover">
                  <span className="grid place-items-center w-11 h-11 rounded-xl bg-primary-container/40 text-primary-onContainer mb-3">
                    <span className="icon">{f.icon}</span>
                  </span>
                  <h3 className="font-display font-semibold text-title-lg text-ink mb-1">{f.title}</h3>
                  <p className="text-body-sm text-ink-variant">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── How it works ───────────────────── */}
      <section id="how-it-works" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="mb-12 max-w-2xl">
            <p className="text-caption text-primary mb-2">HOW IT WORKS</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
              From sign-up to certified
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-6 relative">
            <div className="hidden md:block absolute top-7 left-[12%] right-[12%] h-px bg-gradient-to-r from-primary-container via-tertiary-container to-primary-container" />
            {[
              { icon: "person_add", title: "Sign up free", desc: "Create your account in under a minute. No card needed to start." },
              { icon: "groups_2", title: "Join the live batch", desc: "Pick a cohort that fits your schedule, or go self-paced." },
              { icon: "edit_note", title: "Submit weekly work", desc: "Complete assignments and get real mentor feedback each week." },
              { icon: "workspace_premium", title: "Earn your certificate", desc: "Finish the capstone, pass your mentor review, get certified." },
            ].map((s, i) => (
              <Reveal key={s.title} delay={i * 80} className="relative">
                <div className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30 h-full">
                  <div className="w-12 h-12 rounded-2xl bg-primary-fill text-primary-on grid place-items-center mb-4 relative z-10 shadow-glow">
                    <span className="icon text-[22px]">{s.icon}</span>
                  </div>
                  <p className="font-mono text-label text-primary mb-1 tabular-nums">0{i + 1}</p>
                  <h3 className="font-display font-semibold text-title-lg text-ink mb-1">{s.title}</h3>
                  <p className="text-body-sm text-ink-variant">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── Testimonials ─────────────────── */}
      <section className="py-16 md:py-24 bg-surface-containerLow scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="mb-10 max-w-2xl">
            <p className="text-caption text-primary mb-2">TESTIMONIALS</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
              Real results from people just like you
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {[
              {
                name: "Priya M.",
                role: "HR Executive, Pune",
                quote:
                  "I used to spend 3 hours on reports every Monday. After week 4 of this course, I do the same in 20 minutes with VLOOKUP and pivot tables. My manager asked me to teach the team.",
              },
              {
                name: "Rohit K.",
                role: "MBA student, Nagpur",
                quote:
                  "Rs.399 felt too cheap to be good - I was skeptical. But the live sessions, the mentor who actually reviewed my assignments, and the capstone project changed my mind completely.",
              },
              {
                name: "Sunita D.",
                role: "Homemaker, Surat",
                quote:
                  "I'm a homemaker who wanted to re-enter the workforce. This course gave me a skill and a certificate I could show. Got shortlisted for a data entry role within 6 weeks.",
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 80} className="h-full">
                <figure className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30 h-full relative">
                  <span className="icon text-primary-container/60 text-[44px] absolute top-4 right-5 leading-none select-none" aria-hidden style={{ fontVariationSettings: "'FILL' 1" }}>format_quote</span>
                  <FilledStars count={5} size={18} className="text-primary-fill" />
                  <blockquote className="text-ink mt-3 mb-4 text-body-lg leading-relaxed relative">
                    "{t.quote}"
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <span className="grid place-items-center w-10 h-10 rounded-full bg-gradient-to-br from-primary-container to-primary-fixed text-primary-on font-display font-bold text-title-md shrink-0">
                      {t.name[0]}
                    </span>
                    <div className="leading-tight">
                      <p className="font-semibold text-ink">{t.name}</p>
                      <p className="text-label text-ink-outline">{t.role} · Excel Mastery</p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
          {/* Trust aggregate below testimonials */}
          <Reveal delay={240} className="mt-8 text-center text-body-sm text-ink-outline flex items-center justify-center gap-2">
            <FilledStars count={5} size={14} className="text-primary-fill" />
            <span>200+ learners enrolled · 4.9 avg rating across all cohorts</span>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────── Certificate ─────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-6 grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <p className="text-caption text-primary mb-2">CREDENTIALS</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink mb-4">
              A certificate employers can actually verify
            </h2>
            <p className="text-body-lg text-ink-variant mb-6 max-w-lg">
              Every Silicon Mango certificate carries a unique ID and a public lookup URL. Share it on
              LinkedIn, add it to your resume, and let anyone confirm it in one click.
            </p>
            <ul className="space-y-3 text-body-sm mb-6">
              {[
                "Issued only after completing the capstone project and mentor evaluation",
                "Curriculum mapped to real job requirements in data and analytics roles",
                "Instructor-signed with your name, course, and a unique verification ID",
              ].map((b) => (
                <li key={b} className="flex gap-2.5 items-start">
                  <span className="icon text-tertiary shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-ink-variant">{b}</span>
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-ink-variant font-medium">
              Accepted by 500+ employers · Shareable on LinkedIn and resume
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div className="bg-gradient-to-br from-primary-container/40 to-tertiary-container/30 rounded-3xl p-6 md:p-8 hover-lift">
              <img
                src="/certificate-sample.webp"
                alt="Silicon Mango certificate of completion"
                className="w-full rounded-2xl shadow-modal"
                loading="lazy"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────── FAQ ─────────────────── */}
      <section id="faq" className="py-16 md:py-24 bg-surface-containerLow scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <Reveal className="mb-10 text-center">
            <p className="text-caption text-primary mb-2">FAQ</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
              Questions, answered
            </h2>
          </Reveal>
          <Reveal>
            <FaqAccordion />
          </Reveal>
        </div>
      </section>

      {/* ─────────────────── Final CTA banner ─────────────────── */}
      <section className="pb-16 md:pb-24 pt-4">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal>
            {/* Warm espresso→mango gradient — on-brand, replaces the old olive bleed. */}
            <div className="bg-gradient-to-br from-[#3d2b00] via-[#a85f00] to-[#5c3800] text-white rounded-3xl p-10 md:p-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 grid-pattern opacity-20" />
              <div className="absolute -top-20 -right-10 w-72 h-72 rounded-full bg-primary-fill/25 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-primary-fill/15 blur-3xl" />
              <div className="relative max-w-2xl mx-auto">
                <h2 className="font-display font-extrabold text-display-md md:text-display-lg mb-3 text-balance">
                  Next batch starts 6 July 2026.
                </h2>
                <p className="text-body-lg text-white/85 mb-8">
                  Excel Mastery · 8 weeks · Live classes + mentor support + certificate.
                  All for ₹399 - less than a textbook.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      rightIcon="arrow_forward"
                      className="bg-primary-fill text-primary-on hover:bg-primary-fillHover shadow-glow"
                    >
                      Enroll Now
                    </Button>
                  </Link>
                  <a
                    href={DEMO_YOUTUBE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body-sm text-white/80 hover:text-white underline underline-offset-2 transition-colors"
                  >
                    Not ready? Watch the course demo first
                  </a>
                </div>
                <p className="text-body-sm text-white/70 mt-6">
                  No hidden fees · Cancel before class starts for a full refund · Certificate issued on completion
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <FloatingWhatsApp />
    </div>
  );
}

/* ─────────────────── Sub-components ─────────────────── */

/** Renders N filled gold stars using the Material Symbols font's FILL axis. */
function FilledStars({
  count = 5,
  size = 18,
  className = "text-primary-fill",
}: {
  count?: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="icon leading-none"
          style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
      ))}
    </span>
  );
}

/** Course catalog flagship card: sourced from the API (Excel Mastery) or the static fallback. */
function ExcelCourseCard({ course: c }: { course: PublicCourse }) {
  const features = ["60+ functions", "Dashboard project", "Certificate"];
  const price = Math.max(c.price - (c.price * (c.discount || 0)) / 100, 0);

  return (
    <div className="group bg-surface-lowest rounded-2xl border border-primary/30 shadow-card overflow-hidden h-full flex flex-col ring-1 ring-primary/10">
      {/* Banner */}
      <div className="h-32 relative overflow-hidden">
        {c.banner_url ? (
          <Img
            src={c.banner_url}
            alt={c.title}
            wrapperClassName="h-full w-full"
            className="group-hover:scale-105 transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary-container to-primary-fixed flex items-center justify-center">
            <span className="icon text-[52px] text-primary-on/40">table_chart</span>
          </div>
        )}
        <span className="absolute top-3 left-3 px-2.5 py-1 text-label rounded-full bg-primary-fill text-primary-on font-semibold shadow-sm">
          Live cohort
        </span>
        <span className="absolute top-3 right-3 px-2.5 py-1 text-label rounded-full bg-ink/80 text-white backdrop-blur-sm font-semibold">
          87% off
        </span>
      </div>
      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-label text-ink-outline mb-1">8-week live cohort · Batch starts 6 July 2026</p>
        <h3 className="font-display font-semibold text-title-lg text-ink mb-3">{c.title}</h3>
        <ul className="space-y-2 mb-5 flex-1">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-body-sm text-ink">
              <span className="icon text-[16px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              {f}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between pt-3 border-t border-ink-outlineVariant/30">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-title-lg text-ink tabular-nums">
                {formatCurrency(price)}
              </span>
              <span className="text-body-sm text-ink-outline line-through tabular-nums">
                {formatCurrency(2999)}
              </span>
            </div>
          </div>
          <Link to={`/courses/${c.slug || c.id}`}>
            <Button size="sm" rightIcon="arrow_forward">
              Enroll Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Course catalog Card 2: Python for Career (coming soon — not yet open for enrollment). */
function PythonComingSoon() {
  return (
    <div className="h-full flex flex-col rounded-2xl border border-ink-outlineVariant/60 bg-surface-lowest overflow-hidden">
      <div className="h-32 relative overflow-hidden bg-gradient-to-br from-tertiary-container/40 to-secondary-container flex items-center justify-center">
        <span className="icon text-[52px] text-tertiary/30">code</span>
        <span className="absolute top-3 left-3">
          <Badge tone="tertiary">Coming soon</Badge>
        </span>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <p className="text-label text-ink-outline mb-1">8-week live cohort · Launching August 2025</p>
        <h3 className="font-display font-semibold text-title-lg text-ink mb-2">Python for Career</h3>
        <p className="text-body-sm text-ink-variant flex-1">
          For professionals with zero coding background. Automate the boring parts of your job.
        </p>
        <div className="mt-5 pt-3 border-t border-ink-outlineVariant/30">
          <Link to="/signup">
            <Button variant="outline" fullWidth leftIcon="notifications">
              Get Notified
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Course catalog Card 3: roadmap teaser for SQL & AI (styled as a teaser, not a course). */
function RoadmapTeaserCard() {
  return (
    <div className="h-full flex flex-col rounded-2xl border border-dashed border-ink-outlineVariant/60 bg-surface-lowest/60 overflow-hidden">
      <div className="h-32 relative overflow-hidden bg-gradient-to-br from-surface-container to-surface-containerHigh flex items-center justify-center gap-4">
        <span className="icon text-[36px] text-ink-outlineVariant">database</span>
        <span className="text-ink-outlineVariant/50 text-title-lg font-display">+</span>
        <span className="icon text-[36px] text-ink-outlineVariant">psychology</span>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <Badge tone="neutral" className="mb-3 self-start">On our roadmap</Badge>
        <h3 className="font-display font-semibold text-title-lg text-ink mb-2">
          More tracks coming soon
        </h3>
        <p className="text-body-sm text-ink-variant flex-1">
          SQL and AI tools are next. We build courses based on what learners actually need - leave your
          email and we will let you know when they launch.
        </p>
        <div className="mt-5 pt-3 border-t border-ink-outlineVariant/30">
          <Link to="/signup">
            <Button variant="ghost" fullWidth leftIcon="notifications">
              Get Notified
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: "Is this suitable for complete beginners?",
    a: "Yes, completely. We start from the very basics - no prior Excel knowledge is needed. The course is designed for people who use computers every day but have never gone deep into spreadsheets.",
  },
  {
    q: "What if I miss a live session?",
    a: "Every live class is recorded and posted the same day. You can watch it on your own time and bring your questions to the next week's session.",
  },
  {
    q: "Is the certificate job-ready?",
    a: "Yes. Each certificate has a unique verification ID and a public URL that employers can check instantly. It is issued only after you complete the capstone project and a mentor review - so it means something.",
  },
  {
    q: "Can I get a refund?",
    a: "If you cancel before your batch starts, you get a full refund - no questions asked. Once classes begin, refunds are not available, so if you are unsure, check out a free class first.",
  },
  {
    q: "How much time per week does this require?",
    a: "Plan for around 4 to 5 hours a week: one live class plus a short assignment. Most of our learners fit it around a full-time job without any trouble.",
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-ink-outlineVariant/40 rounded-2xl border border-ink-outlineVariant/40 bg-surface-lowest overflow-hidden">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 md:px-6 md:py-5 hover:bg-surface-containerLow/60 transition-colors"
            >
              <span className="font-display font-semibold text-title-md text-ink">{item.q}</span>
              <span
                className={`icon text-ink-outline shrink-0 transition-transform duration-300 ease-spring ${isOpen ? "rotate-180" : ""}`}
              >
                expand_more
              </span>
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 md:px-6 md:pb-6 text-body-sm text-ink-variant leading-relaxed max-w-[60ch]">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
