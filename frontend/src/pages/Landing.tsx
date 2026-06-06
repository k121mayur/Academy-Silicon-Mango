import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
  const [stats, setStats] = useState<Stats>({ students: 0, instructors: 0, courses: 0, certificates: 0 });
  const [webinars, setWebinars] = useState<PublicWebinarListItem[]>([]);

  useEffect(() => {
    api
      .get("/public/courses?limit=6")
      .then((res) => setCourses(res.data?.data || []))
      .catch((e) => console.warn("[LANDING] Failed to load courses", e));
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
    <div className="bg-surface">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center relative">
          <div className="space-y-5">
            <Badge tone="primary" icon="bolt">New cohorts open</Badge>
            <h1 className="font-display font-extrabold text-display-lg md:text-display-xl text-ink leading-[1.05]">
              Learn. Build.{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-primary-fixed to-primary-container">
                Get Certified.
              </span>
            </h1>
            <p className="text-body-lg text-ink-variant max-w-xl">
              Live, instructor-led cohorts and self-paced tracks designed by industry practitioners.
              Build a portfolio, earn a verified certificate, and level up your career.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/signup">
                <Button size="lg" rightIcon="arrow_forward">Explore Courses</Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" leftIcon="play_circle">Watch Demo</Button>
              </Link>
            </div>
            <div className="flex items-center gap-4 pt-3 text-body-sm text-ink-variant">
              <div className="flex -space-x-2">
                {["#ffb800", "#00d7fe", "#d2e4fb"].map((c, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-surface" style={{ background: c }} />
                ))}
              </div>
              <span>Joined by {stats.students.toLocaleString()}+ learners</span>
            </div>
          </div>
          <div className="relative h-[420px] hidden md:block">
            <div className="absolute top-4 left-8 w-56 bg-surface-lowest rounded-2xl shadow-card p-4 animate-float" style={{ animationDelay: "0s" }}>
              <div className="h-24 rounded-xl bg-gradient-to-br from-primary-container to-primary-fixed mb-3" />
              <p className="text-body-sm font-semibold text-ink">Full-Stack Web Dev</p>
              <p className="text-label text-ink-outline">12-week cohort</p>
            </div>
            <div className="absolute top-32 right-4 w-56 bg-surface-lowest rounded-2xl shadow-card p-4 animate-float" style={{ animationDelay: "1.5s" }}>
              <div className="h-24 rounded-xl bg-gradient-to-br from-tertiary-container to-tertiary mb-3" />
              <p className="text-body-sm font-semibold text-ink">Data Science Bootcamp</p>
              <p className="text-label text-ink-outline">8-week intensive</p>
            </div>
            <div className="absolute bottom-4 left-16 w-56 bg-surface-lowest rounded-2xl shadow-card p-4 animate-float" style={{ animationDelay: "3s" }}>
              <div className="h-24 rounded-xl bg-gradient-to-br from-secondary-container to-[#a8c8eb] mb-3" />
              <p className="text-body-sm font-semibold text-ink">UX Foundations</p>
              <p className="text-label text-ink-outline">Self-paced</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="bg-primary-container">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Students", value: stats.students, icon: "school" },
            { label: "Courses", value: stats.courses, icon: "menu_book" },
            { label: "Instructors", value: stats.instructors, icon: "psychology" },
            { label: "Certificates issued", value: stats.certificates, icon: "workspace_premium" },
          ].map((m) => (
            <div key={m.label} className="text-primary-onContainer flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/40 grid place-items-center">
                <span className="icon">{m.icon}</span>
              </div>
              <div>
                <p className="font-display font-extrabold text-display-md leading-none">{m.value.toLocaleString()}+</p>
                <p className="text-label uppercase tracking-wide">{m.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Courses */}
      <section id="courses" className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="text-caption text-tertiary mb-2">CATALOG</p>
              <h2 className="font-display font-bold text-display-md text-ink">Featured courses</h2>
            </div>
            <Link to="/signup" className="text-body-sm text-primary font-semibold hover:underline hidden md:block">
              View all courses →
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-12 bg-surface-lowest rounded-2xl border border-dashed border-ink-outlineVariant/60">
              <span className="icon text-[40px] text-ink-outline">menu_book</span>
              <p className="text-title-md text-ink mt-3">Courses launching soon</p>
              <p className="text-body-sm text-ink-variant">Check back here once new courses are published.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {courses.map((c) => (
                <article key={c.id} className="bg-surface-lowest rounded-2xl border border-ink-outlineVariant/40 shadow-card overflow-hidden hover:-translate-y-1 hover:shadow-modal transition-all">
                  <div className="h-40 bg-gradient-to-br from-primary-container to-primary-fixed relative">
                    {c.banner_url && (
                      <img src={c.banner_url} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {c.category && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 text-label rounded-full bg-tertiary text-white">
                        {c.category}
                      </span>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-display font-semibold text-title-lg text-ink mb-1.5">{c.title}</h3>
                    <p className="text-body-sm text-ink-variant line-clamp-2 mb-3">{c.description || "Hands-on course"}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm text-ink-variant">
                        <span className="icon align-middle text-[16px] mr-1">schedule</span>
                        {c.duration_value} {c.duration_unit}
                      </span>
                      <p className="font-display font-bold text-title-md text-primary">
                        {formatCurrency(Math.max(c.price - (c.price * (c.discount || 0)) / 100, 0))}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Upcoming Webinars */}
      {webinars.length > 0 && (
        <section id="webinars" className="py-16 md:py-20 bg-surface-containerLow">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-caption text-tertiary mb-2">LIVE EVENTS</p>
                <h2 className="font-display font-bold text-display-md text-ink">Upcoming webinars</h2>
              </div>
              <Link to="/webinars" className="text-body-sm text-primary font-semibold hover:underline hidden md:block">
                View all webinars →
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {webinars.map((w) => (
                <WebinarCard key={w.id} webinar={w} />
              ))}
            </div>
            <div className="mt-6 md:hidden">
              <Link to="/webinars">
                <Button variant="outline" fullWidth rightIcon="arrow_forward">
                  View all webinars
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* How It Works */}
      <section id="how-it-works" className="py-16 md:py-20 bg-surface-containerLow">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10">
            <p className="text-caption text-tertiary mb-2">WORKFLOW</p>
            <h2 className="font-display font-bold text-display-md text-ink">How it works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 relative">
            {[
              { icon: "person_add", title: "Sign up", desc: "Create your account in under a minute with email or Google." },
              { icon: "groups_2", title: "Enroll in a batch", desc: "Pick a live cohort or self-paced track that fits your schedule." },
              { icon: "workspace_premium", title: "Get certified", desc: "Complete coursework and earn a verifiable certificate." },
            ].map((s, i) => (
              <div key={i} className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30">
                <div className="w-12 h-12 rounded-xl bg-primary-container grid place-items-center mb-4">
                  <span className="icon text-primary-onContainer">{s.icon}</span>
                </div>
                <p className="text-caption text-ink-outline mb-1">STEP 0{i + 1}</p>
                <h3 className="font-display font-semibold text-title-lg text-ink mb-1">{s.title}</h3>
                <p className="text-body-sm text-ink-variant">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instructor Showcase */}
      <section id="instructors" className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10">
            <p className="text-caption text-tertiary mb-2">EXPERTS</p>
            <h2 className="font-display font-bold text-display-md text-ink">Learn from practitioners</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              { name: "Aanya Sharma", expertise: "Machine Learning", color: "#ffb800" },
              { name: "Dev Patel", expertise: "Backend & Cloud", color: "#00d7fe" },
              { name: "Riya Kapoor", expertise: "Product Design", color: "#d2e4fb" },
              { name: "Karan Mehta", expertise: "Frontend", color: "#ffba20" },
            ].map((i) => (
              <div key={i.name} className="bg-surface-lowest rounded-2xl p-5 border border-ink-outlineVariant/30 hover:shadow-card transition-shadow text-center">
                <div className="w-20 h-20 rounded-full mx-auto mb-3" style={{ background: i.color }} />
                <p className="font-semibold text-ink">{i.name}</p>
                <p className="text-label text-ink-outline">{i.expertise}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 md:py-20 bg-surface-containerLow">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10">
            <p className="text-caption text-tertiary mb-2">SOCIAL PROOF</p>
            <h2 className="font-display font-bold text-display-md text-ink">Students love what we do</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: "Ishita R.", quote: "The live cohort kept me accountable and the projects landed me my first PR.", course: "Full-Stack Web Dev" },
              { name: "Aman J.", quote: "Hands-on labs > theoretical lectures. Mentors actually review your code.", course: "Data Science" },
              { name: "Sara F.", quote: "I built a real portfolio in 8 weeks. Worth every rupee.", course: "UX Foundations" },
            ].map((t, i) => (
              <div key={i} className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30">
                <div className="flex gap-0.5 text-primary-fixed mb-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <span key={j} className="icon text-[18px]">star</span>
                  ))}
                </div>
                <p className="text-ink mb-4">"{t.quote}"</p>
                <p className="font-semibold text-ink">{t.name}</p>
                <p className="text-label text-ink-outline">{t.course}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certificate Highlight */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-caption text-tertiary mb-2">CREDENTIALS</p>
            <h2 className="font-display font-bold text-display-md text-ink mb-3">Earn a verifiable certificate</h2>
            <p className="text-body-lg text-ink-variant mb-5">
              Every Silicon Mango certificate carries a unique ID and lookup URL — share it with employers,
              add it to LinkedIn, and prove what you've built.
            </p>
            <ul className="space-y-2 text-body-sm">
              {["Issued only after rubric-based completion", "Industry-aligned curriculum", "Includes signed instructor evaluation"].map(
                (b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="icon text-tertiary">check_circle</span>
                    {b}
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="bg-gradient-to-br from-primary-container/30 to-tertiary-container/30 rounded-3xl p-8">
            <div className="bg-surface-lowest rounded-2xl shadow-card p-6 aspect-[4/3] flex flex-col items-center justify-center text-center">
              <span className="icon text-[40px] text-primary mb-2">workspace_premium</span>
              <p className="text-caption text-ink-outline">CERTIFICATE OF COMPLETION</p>
              <p className="font-display font-bold text-title-lg text-ink mt-2">Full-Stack Web Development</p>
              <p className="text-body-sm text-ink-variant mt-1">Awarded to Your Name</p>
              <div className="mt-3 w-32 h-px bg-primary" />
              <p className="text-label text-ink-outline mt-1">Silicon Mango Academy</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="bg-primary text-white rounded-3xl p-10 md:p-14 text-center">
            <h2 className="font-display font-extrabold text-display-md md:text-display-lg mb-3">
              Ready to start learning?
            </h2>
            <p className="text-body-lg text-white/85 max-w-xl mx-auto mb-6">
              Join the next cohort and build real, shippable projects with mentor guidance.
            </p>
            <Link to="/signup">
              <Button size="lg" variant="secondary" rightIcon="arrow_forward">
                Create your free account
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
