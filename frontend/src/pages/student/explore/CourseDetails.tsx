import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { RichTextView } from "@/components/shared/RichTextView";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { formatCurrency } from "@/lib/utils";
import { absoluteApiUrl } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import {
  finalPrice,
  getPublicCourse,
  getPublicCourseBatches,
  type PublicCourseDetail,
} from "@/services/public.service";

type Tab = "overview" | "syllabus" | "faqs" | "certificate";

export default function CourseDetails() {
  const { courseId = "" } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: course, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.public.course(courseId),
    queryFn: () => getPublicCourse(courseId),
    staleTime: 5 * 60_000,
    enabled: !!courseId,
  });

  const prefetchBatches = () =>
    queryClient.prefetchQuery({
      queryKey: qk.public.courseBatches(courseId),
      queryFn: () => getPublicCourseBatches(courseId),
    });

  if (isError) {
    return <QueryErrorState error={error} onRetry={() => refetch()} title="Couldn't load this course" />;
  }

  if (isLoading || !course) return <CourseDetailSkeleton />;

  const price = Number(course.price);
  const discount = Number(course.discount || 0);
  const payable = finalPrice(price, discount);
  const hasDiscount = discount > 0;

  const goEnroll = () => navigate(ROUTES.student.batchSelect(courseId));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <nav className="text-label text-ink-outline flex items-center gap-1.5 animate-fade-in">
        <Link to={ROUTES.student.explore} className="hover:text-primary">
          Explore
        </Link>
        <span className="icon text-[14px]">chevron_right</span>
        <span className="text-ink-variant truncate max-w-[60vw]">{course.title}</span>
      </nav>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Left: hero + tabs */}
        <div className="lg:col-span-2 space-y-5">
          {/* Hero */}
          <div className="relative h-56 md:h-64 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container animate-slide-up">
            {course.banner_url && (
              <img
                src={absoluteApiUrl(course.banner_url)}
                alt={course.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 text-white">
              <div className="flex items-center gap-2 mb-2 flex-wrap text-label uppercase tracking-wider opacity-90">
                {course.category && <span>{course.category}</span>}
                <span className="opacity-50">·</span>
                <span>{course.course_type === "self_paced" ? "Self-paced" : "Live cohort"}</span>
                <span className="opacity-50">·</span>
                <span>
                  {course.duration_value} {course.duration_unit}
                </span>
              </div>
              <h1 className="font-display font-bold text-display-md leading-tight drop-shadow-lg">
                {course.title}
              </h1>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-ink-outlineVariant/30 flex gap-1 overflow-x-auto scrollbar-thin">
            {[
              { id: "overview" as const, label: "Overview", icon: "info" },
              { id: "syllabus" as const, label: `Syllabus (${course.syllabus_items?.length || 0})`, icon: "list_alt" },
              { id: "faqs" as const, label: `FAQs (${course.faqs?.length || 0})`, icon: "help_outline" },
              {
                id: "certificate" as const,
                label: `Certificate (${course.certification_criteria?.length || 0})`,
                icon: "workspace_premium",
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 h-11 text-body-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-ink-variant hover:text-ink"
                }`}
              >
                <span className="icon text-[16px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="animate-fade-in">
            {tab === "overview" && <OverviewTab course={course} />}
            {tab === "syllabus" && <SyllabusTab course={course} />}
            {tab === "faqs" && <FaqsTab course={course} />}
            {tab === "certificate" && <CertificateTab course={course} />}
          </div>
        </div>

        {/* Right: price + CTA (sticky on desktop) */}
        <aside className="lg:sticky lg:top-24 space-y-4">
          <div className="bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl shadow-card p-5 animate-slide-up">
            <div className="flex items-end gap-2">
              <p className="font-display font-bold text-display-md text-primary leading-none">
                {payable === 0 ? "Free" : formatCurrency(payable)}
              </p>
              {hasDiscount && (
                <p className="text-body-sm text-ink-outline line-through font-mono mb-1">{formatCurrency(price)}</p>
              )}
            </div>
            {hasDiscount && (
              <p className="text-label text-success mt-1">You save {formatCurrency(discount)}</p>
            )}
            <Button
              fullWidth
              size="lg"
              className="mt-4"
              rightIcon="arrow_forward"
              onMouseEnter={prefetchBatches}
              onFocus={prefetchBatches}
              onClick={goEnroll}
            >
              Enroll now
            </Button>
            <ul className="mt-4 space-y-2 text-body-sm text-ink-variant">
              <li className="flex items-center gap-2">
                <span className="icon text-[18px] text-success">check_circle</span>
                {course.course_type === "self_paced" ? "Lifetime access to lessons" : "Live instructor-led sessions"}
              </li>
              <li className="flex items-center gap-2">
                <span className="icon text-[18px] text-success">check_circle</span>
                Certificate on completion
              </li>
              <li className="flex items-center gap-2">
                <span className="icon text-[18px] text-success">check_circle</span>
                Assignments &amp; feedback
              </li>
            </ul>
          </div>

          {course.instructors.length > 0 && (
            <div className="bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl shadow-card p-5">
              <p className="text-label text-ink-outline uppercase tracking-wide mb-3">Instructors</p>
              <div className="space-y-3">
                {course.instructors.map((ins, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Avatar name={ins.display_name} src={ins.avatar_url ? absoluteApiUrl(ins.avatar_url) : null} size="sm" />
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-ink truncate">{ins.display_name}</p>
                      {ins.bio && <p className="text-label text-ink-outline line-clamp-1">{ins.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function OverviewTab({ course }: { course: PublicCourseDetail }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-title-md font-semibold text-ink mb-2">About this course</h3>
        <RichTextView html={course.description} fallback="No description added yet." />
      </section>
      {course.syllabus_pdf_url && (
        <a
          href={absoluteApiUrl(course.syllabus_pdf_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-surface-containerLow hover:bg-surface-container border border-ink-outlineVariant transition-colors text-body-sm font-medium text-ink"
        >
          <span className="icon">picture_as_pdf</span>
          Download full syllabus PDF
        </a>
      )}
      {(course.tags || []).length > 0 && (
        <section>
          <p className="text-label text-ink-outline mb-2 uppercase tracking-wide">Topics</p>
          <div className="flex flex-wrap gap-2">
            {course.tags.map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SyllabusTab({ course }: { course: PublicCourseDetail }) {
  const items = (course.syllabus_items || []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  if (items.length === 0) return <p className="text-body-sm text-ink-outline">No syllabus items added yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((s: any, i: number) => (
        <details
          key={i}
          className="group bg-surface-containerLow rounded-xl border border-ink-outlineVariant/40 overflow-hidden"
          open={i === 0}
        >
          <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3 hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-primary-container text-primary-onContainer grid place-items-center text-body-sm font-semibold shrink-0">
                {i + 1}
              </span>
              <span className="font-semibold text-ink truncate">{s.title}</span>
            </div>
            <span className="icon text-ink-outline transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div className="px-4 pb-4 pl-[60px]">
            <RichTextView html={s.description} fallback="No description for this module." />
          </div>
        </details>
      ))}
    </div>
  );
}

function FaqsTab({ course }: { course: PublicCourseDetail }) {
  const faqs = (course.faqs || []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  if (faqs.length === 0) return <p className="text-body-sm text-ink-outline">No FAQs added yet.</p>;
  return (
    <div className="space-y-3">
      {faqs.map((f: any, i: number) => (
        <details key={i} className="group bg-surface-containerLow rounded-xl border border-ink-outlineVariant/40 overflow-hidden">
          <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3 hover:bg-surface-container transition-colors">
            <span className="font-medium text-ink">{f.question}</span>
            <span className="icon text-ink-outline transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div className="px-4 pb-4">
            <p className="text-body-sm text-ink-variant whitespace-pre-line">{f.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

function CertificateTab({ course }: { course: PublicCourseDetail }) {
  const criteria = (course.certification_criteria || []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-variant">
        Meet the following criteria to earn your certificate of completion:
      </p>
      {criteria.length === 0 ? (
        <p className="text-body-sm text-ink-outline">No criteria added yet.</p>
      ) : (
        <ul className="space-y-2">
          {criteria.map((c: any, i: number) => (
            <li
              key={i}
              className="flex items-start gap-3 p-3 bg-surface-containerLow rounded-lg border border-ink-outlineVariant/40"
            >
              <span className="icon text-success mt-0.5">check_circle</span>
              <span className="text-body-sm text-ink">{c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseDetailSkeleton() {
  return (
    <div className="grid lg:grid-cols-3 gap-6 animate-pulse">
      <div className="lg:col-span-2 space-y-5">
        <div className="h-56 md:h-64 bg-surface-container rounded-2xl" />
        <div className="h-10 bg-surface-container rounded w-2/3" />
        <div className="h-4 bg-surface-container rounded w-full" />
        <div className="h-4 bg-surface-container rounded w-5/6" />
        <div className="h-4 bg-surface-container rounded w-3/4" />
      </div>
      <div className="h-64 bg-surface-container rounded-2xl" />
    </div>
  );
}
