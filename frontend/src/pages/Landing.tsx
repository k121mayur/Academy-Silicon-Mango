import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Reveal } from "@/components/ui/Reveal";
import { CountUp } from "@/components/ui/CountUp";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Img } from "@/components/ui/Img";
import { stripHtml } from "@/components/shared/RichTextView";
import { formatCurrency } from "@/lib/utils";
import { WebinarCard } from "@/components/webinar/WebinarCard";
import { listPublicWebinars, type PublicWebinarListItem } from "@/services/webinar.service";

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

interface Stats {
  students: number;
  instructors: number;
  courses: number;
  certificates: number;
}

export default function Landing() {
  const [courses, setCourses] = useState<PublicCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [stats, setStats] = useState<Stats>({ students: 0, instructors: 0, courses: 0, certificates: 0 });
  const [webinars, setWebinars] = useState<PublicWebinarListItem[]>([]);

  useEffect(() => {
    api
      .get("/public/courses?limit=6")
      .then((res) => setCourses(res.data?.data || []))
      .catch((e) => console.warn("[LANDING] Failed to load courses", e))
      .finally(() => setLoadingCourses(false));
    api
      .get("/public/stats")
      .then((res) => setStats(res.data?.data || stats))
      .catch((e) => console.warn("[LANDING] Failed to load stats", e));
    listPublicWebinars("upcoming")
      .then((w) => setWebinars(w.slice(0, 3)))
      .catch((e) => console.warn("[LANDING] Failed to load webinars", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-surface overflow-x-clip">
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-mango-aurora pointer-events-none" />
        <div className="absolute inset-0 grid-pattern opacity-40 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-12 pb-16 md:pt-20 md:pb-24 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center relative">
          <div className="space-y-6 max-w-2xl">
            <div className="animate-slide-up">
              <Badge tone="primary" icon="bolt">New cohorts open for enrollment</Badge>
            </div>
            <h1
              className="font-display font-extrabold text-display-lg md:text-display-xl text-ink leading-[1.04] animate-slide-up"
              style={{ animationDelay: "60ms" }}
            >
              Learn by building.{" "}
              <span className="text-gradient-mango animate-gradient-pan">Get certified for real.</span>
            </h1>
            <p
              className="text-body-lg text-ink-variant max-w-xl animate-slide-up"
              style={{ animationDelay: "120ms" }}
            >
              Live, instructor-led cohorts and self-paced tracks from industry practitioners — build a
              portfolio and earn a verifiable certificate.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 animate-slide-up" style={{ animationDelay: "180ms" }}>
              <Link to="/signup">
                <Button size="lg" rightIcon="arrow_forward" className="shadow-glow">
                  Start learning free
                </Button>
              </Link>
              <a href="#courses">
                <Button size="lg" variant="outline" leftIcon="grid_view">
                  Browse courses
                </Button>
              </a>
            </div>
          </div>

          {/* Branded animated visual (decorative — hidden on small screens to stay light) */}
          <div className="relative h-[460px] hidden lg:block" aria-hidden>
            <div className="absolute inset-0 grid place-items-center">
              <div className="relative w-72 h-72 rounded-full gradient-mango opacity-90 blur-[2px] shadow-glow animate-float-slow" />
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-44 h-44 rounded-[2rem] glass grid place-items-center shadow-card animate-scale-in">
                <img src="/Logo1.png" alt="" width={120} height={120} className="w-28 h-28 object-contain drop-shadow" />
              </div>
            </div>

            <FloatingChip className="top-6 left-2" delay="0s" icon="terminal" label="Full-Stack Dev" sub="12-week cohort" />
            <FloatingChip className="top-24 right-0" delay="1.4s" icon="insights" label="Data Science" sub="8-week intensive" />
            <FloatingChip className="bottom-8 left-10" delay="2.6s" icon="design_services" label="UX Foundations" sub="Self-paced" />
            <div
              className="absolute bottom-2 right-4 bg-tertiary text-white rounded-2xl px-4 py-3 shadow-glow-cyan animate-float"
              style={{ animationDelay: "0.8s" }}
            >
              <p className="text-caption opacity-80">VERIFIED</p>
              <p className="font-display font-bold text-title-md flex items-center gap-1.5">
                <span className="icon text-[18px]">workspace_premium</span> Certificate
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── Stats strip ───────────────────── */}
      <section className="bg-primary-container relative">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Learners", value: stats.students, icon: "school" },
            { label: "Courses", value: stats.courses, icon: "menu_book" },
            { label: "Instructors", value: stats.instructors, icon: "psychology" },
            { label: "Certificates issued", value: stats.certificates, icon: "workspace_premium" },
          ].map((m, i) => (
            <Reveal key={m.label} delay={i * 80} className="text-primary-onContainer flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/40 grid place-items-center shrink-0">
                <span className="icon">{m.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="font-display font-extrabold text-display-md leading-none tabular-nums">
                  <CountUp to={m.value} suffix="+" />
                </p>
                <p className="text-label uppercase tracking-wide truncate">{m.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─────────────────── Featured courses ─────────────────── */}
      <section id="courses" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="flex items-end justify-between mb-10 gap-4">
            <div>
              <p className="text-caption text-tertiary mb-2">CATALOG</p>
              <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">Featured courses</h2>
            </div>
            <Link to="/courses" className="text-body-sm text-primary font-semibold hover:underline hidden md:flex items-center gap-1 shrink-0">
              View all <span className="icon text-[18px]">arrow_forward</span>
            </Link>
          </Reveal>

          {loadingCourses ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-16 bg-surface-lowest rounded-2xl border border-dashed border-ink-outlineVariant/60">
              <span className="icon text-[40px] text-ink-outline">menu_book</span>
              <p className="text-title-md text-ink mt-3">Courses launching soon</p>
              <p className="text-body-sm text-ink-variant">Check back here once new courses are published.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((c, i) => (
                <Reveal key={c.id} delay={(i % 3) * 70} as="article" className="h-full">
                  <Link to={`/courses/${c.slug || c.id}`} className="group bg-surface-lowest rounded-2xl border border-ink-outlineVariant/40 shadow-card overflow-hidden h-full flex flex-col hover-lift hover:shadow-card-hover hover:border-ink-outlineVariant/70">
                    <div className="h-44 relative overflow-hidden">
                      {c.banner_url ? (
                        <Img
                          src={c.banner_url}
                          alt={c.title}
                          wrapperClassName="h-full w-full"
                          className="group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-primary-container to-primary-fixed" />
                      )}
                      {c.category && (
                        <span className="absolute top-3 left-3 px-2.5 py-0.5 text-label rounded-full bg-ink/80 text-white backdrop-blur-sm">
                          {c.category}
                        </span>
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="font-display font-semibold text-title-lg text-ink mb-1.5">{c.title}</h3>
                      <p className="text-body-sm text-ink-variant line-clamp-2 mb-4 flex-1">
                        {stripHtml(c.description) || "Hands-on, project-based course built by practitioners."}
                      </p>
                      <div className="flex items-center justify-between pt-3 border-t border-ink-outlineVariant/30">
                        <span className="text-body-sm text-ink-variant inline-flex items-center gap-1">
                          <span className="icon text-[16px]">schedule</span>
                          {c.duration_value} {c.duration_unit}
                        </span>
                        <p className="font-display font-bold text-title-md text-primary tabular-nums">
                          {formatCurrency(Math.max(c.price - (c.price * (c.discount || 0)) / 100, 0))}
                        </p>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────── Why Silicon Mango (bento) ─────────────────── */}
      <section id="about" className="py-16 md:py-24 bg-surface-containerLow scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="max-w-2xl mb-10">
            <p className="text-caption text-tertiary mb-2">WHY SILICON MANGO</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">
              Everything you need to actually finish — and prove it.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5 auto-rows-[minmax(0,1fr)]">
            {/* Wide feature cell */}
            <Reveal className="md:col-span-2 md:row-span-2">
              <div className="h-full bg-ink text-surface rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-primary-container/20 blur-3xl" />
                <div className="absolute inset-0 grid-pattern opacity-20" />
                <div className="relative">
                  <span className="grid place-items-center w-12 h-12 rounded-xl bg-primary-container text-primary-onContainer mb-4">
                    <span className="icon">smart_display</span>
                  </span>
                  <h3 className="font-display font-bold text-headline mb-2">Secure, adaptive video lessons</h3>
                  <p className="text-body-sm text-surface-containerHigh/80 max-w-md">
                    Recorded lessons stream as adaptive HLS with an email watermark — they play smoothly even on
                    slow connections, and stay protected from casual downloads.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {["720p HLS", "Edge-cached", "Watermarked", "Resume anywhere"].map((t) => (
                      <span key={t} className="text-label px-2.5 py-1 rounded-full bg-white/10 text-surface-containerHigh">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
            {[
              { icon: "groups_2", title: "Live cohorts + self-paced", desc: "Pick a scheduled cohort or learn on your own clock." },
              { icon: "rate_review", title: "Mentor-graded work", desc: "Real feedback on assignments, not auto-graded quizzes." },
              { icon: "workspace_premium", title: "Verifiable certificates", desc: "A unique ID and public lookup URL employers can check." },
              { icon: "wifi", title: "Works on low bandwidth", desc: "Lightweight and resilient on patchy connections and modest devices." },
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
          <Reveal className="mb-12">
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">Three steps to certified</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Connecting trace line (decorative, circuit motif) */}
            <div className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px bg-gradient-to-r from-primary-container via-tertiary-container to-primary-container" />
            {[
              { icon: "person_add", title: "Sign up", desc: "Create your account in under a minute with email or Google." },
              { icon: "groups_2", title: "Enroll in a batch", desc: "Pick a live cohort or self-paced track that fits your schedule." },
              { icon: "workspace_premium", title: "Get certified", desc: "Complete the coursework and earn a verifiable certificate." },
            ].map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="relative">
                <div className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30 h-full">
                  <div className="w-14 h-14 rounded-2xl bg-primary text-white grid place-items-center mb-4 relative z-10 shadow-glow">
                    <span className="icon text-[26px]">{s.icon}</span>
                  </div>
                  <p className="text-caption text-ink-outline mb-1">STEP 0{i + 1}</p>
                  <h3 className="font-display font-semibold text-title-lg text-ink mb-1">{s.title}</h3>
                  <p className="text-body-sm text-ink-variant">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── Upcoming webinars ─────────────────── */}
      {webinars.length > 0 && (
        <section id="webinars" className="py-16 md:py-24 bg-surface-containerLow scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Reveal className="flex items-end justify-between mb-10 gap-4">
              <div>
                <p className="text-caption text-tertiary mb-2">LIVE EVENTS</p>
                <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">Upcoming webinars</h2>
              </div>
              <Link to="/webinars" className="text-body-sm text-primary font-semibold hover:underline hidden md:flex items-center gap-1 shrink-0">
                View all <span className="icon text-[18px]">arrow_forward</span>
              </Link>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {webinars.map((w, i) => (
                <Reveal key={w.id} delay={(i % 3) * 70}>
                  <WebinarCard webinar={w} />
                </Reveal>
              ))}
            </div>
            <div className="mt-6 md:hidden">
              <Link to="/webinars">
                <Button variant="outline" fullWidth rightIcon="arrow_forward">View all webinars</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─────────────────── Instructors ─────────────────── */}
      <section id="instructors" className="py-16 md:py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="mb-10">
            <p className="text-caption text-tertiary mb-2">EXPERTS</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">Learn from practitioners</h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { name: "Aanya Sharma", expertise: "Machine Learning", color: "from-primary-container to-primary-fixed" },
              { name: "Dev Patel", expertise: "Backend & Cloud", color: "from-tertiary-container to-tertiary" },
              { name: "Riya Kapoor", expertise: "Product Design", color: "from-secondary-container to-[#a8c8eb]" },
              { name: "Karan Mehta", expertise: "Frontend", color: "from-primary-fixed to-primary-container" },
            ].map((p, i) => (
              <Reveal key={p.name} delay={i * 60}>
                <div className="bg-surface-lowest rounded-2xl p-5 border border-ink-outlineVariant/30 hover-lift hover:shadow-card text-center h-full">
                  <div className={`w-20 h-20 rounded-2xl mx-auto mb-3 bg-gradient-to-br ${p.color}`} />
                  <p className="font-semibold text-ink">{p.name}</p>
                  <p className="text-label text-ink-outline">{p.expertise}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── Testimonials ─────────────────── */}
      <section className="py-16 md:py-24 bg-surface-containerLow">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal className="mb-10">
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink">What learners say</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {[
              { name: "Ishita R.", quote: "The live cohort kept me accountable, and the projects landed me my first pull request at work.", course: "Full-Stack Web Dev", tall: true },
              { name: "Aman J.", quote: "Hands-on labs beat lectures. Mentors actually review your code line by line.", course: "Data Science", tall: false },
              { name: "Sara F.", quote: "I built a real portfolio in 8 weeks. The certificate verification link is a nice touch for recruiters.", course: "UX Foundations", tall: true },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 80} className={t.tall ? "md:mt-0" : "md:mt-8"}>
                <figure className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30 h-full">
                  <div className="flex gap-0.5 text-primary-fixed mb-3">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <span key={j} className="icon text-[18px]">star</span>
                    ))}
                  </div>
                  <blockquote className="text-ink mb-4 text-body-lg leading-relaxed">“{t.quote}”</blockquote>
                  <figcaption>
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="text-label text-ink-outline">{t.course}</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── Certificate highlight ─────────────────── */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-6 grid md:grid-cols-2 gap-12 items-center">
          <Reveal>
            <p className="text-caption text-tertiary mb-2">CREDENTIALS</p>
            <h2 className="font-display font-bold text-display-md md:text-display-lg text-ink mb-4">
              A certificate employers can actually verify
            </h2>
            <p className="text-body-lg text-ink-variant mb-6 max-w-lg">
              Every Silicon Mango certificate carries a unique ID and public lookup URL. Share it on LinkedIn,
              add it to your résumé, and let anyone confirm it in one click.
            </p>
            <ul className="space-y-3 text-body-sm">
              {["Issued only after rubric-based completion", "Industry-aligned curriculum", "Signed instructor evaluation"].map((b) => (
                <li key={b} className="flex gap-2.5 items-center">
                  <span className="icon text-tertiary">check_circle</span>
                  <span className="text-ink-variant">{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="bg-gradient-to-br from-primary-container/40 to-tertiary-container/30 rounded-3xl p-6 md:p-8 hover-lift">
              <div className="bg-surface-lowest rounded-2xl shadow-modal p-8 aspect-[4/3] flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute inset-0 grid-pattern opacity-30" />
                <span className="icon text-[44px] text-primary mb-2 relative">workspace_premium</span>
                <p className="text-caption text-ink-outline relative">CERTIFICATE OF COMPLETION</p>
                <p className="font-display font-bold text-title-lg text-ink mt-2 relative">Full-Stack Web Development</p>
                <p className="text-body-sm text-ink-variant mt-1 relative">Awarded to Your Name</p>
                <div className="mt-3 w-32 h-px bg-primary-fill relative" />
                <p className="text-label text-ink-outline mt-1 relative">Silicon Mango Academy · ID SMA-2026-0001</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────── CTA banner ─────────────────── */}
      <section className="pb-16 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <Reveal>
            <div className="bg-primary text-white rounded-3xl p-10 md:p-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 grid-pattern opacity-20" />
              <div className="absolute -top-20 -right-10 w-72 h-72 rounded-full bg-tertiary-container/30 blur-3xl" />
              <div className="relative">
                <h2 className="font-display font-extrabold text-display-md md:text-display-lg mb-3">Ready to start learning?</h2>
                <p className="text-body-lg text-white/85 max-w-xl mx-auto mb-7">
                  Join the next cohort and build real, shippable projects with mentor guidance.
                </p>
                <Link to="/signup">
                  <Button size="lg" variant="secondary" rightIcon="arrow_forward">Create your free account</Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function FloatingChip({
  className,
  delay,
  icon,
  label,
  sub,
}: {
  className: string;
  delay: string;
  icon: string;
  label: string;
  sub: string;
}) {
  return (
    <div
      className={`absolute ${className} w-48 glass rounded-2xl p-4 shadow-card animate-float`}
      style={{ animationDelay: delay }}
    >
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary-container text-primary-onContainer mb-2">
        <span className="icon text-[18px]">{icon}</span>
      </span>
      <p className="text-body-sm font-semibold text-ink">{label}</p>
      <p className="text-label text-ink-outline">{sub}</p>
    </div>
  );
}
