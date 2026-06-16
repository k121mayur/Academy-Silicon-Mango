import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RichTextView } from "@/components/shared/RichTextView";
import { CourseDTO, getCourse } from "@/services/admin.service";
import { formatCurrency } from "@/lib/utils";

interface Props {
  courseId: string | null;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onTogglePublish?: (course: CourseDTO) => Promise<void> | void;
}

export function CourseDetailModal({ courseId, onClose, onEdit, onTogglePublish }: Props) {
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "syllabus" | "faqs" | "certificate">("overview");
  const [busyToggle, setBusyToggle] = useState(false);

  useEffect(() => {
    if (!courseId) {
      setCourse(null);
      return;
    }
    setLoading(true);
    setActiveTab("overview");
    getCourse(courseId)
      .then(setCourse)
      .catch(() => setCourse(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [courseId, onClose]);

  if (!courseId) return null;

  const finalPrice = course
    ? Math.max(Number(course.price) - (Number(course.price) * Number(course.discount || 0)) / 100, 0)
    : 0;
  const hasDiscount = course && Number(course.discount || 0) > 0;
  const totalSyllabus = course?.syllabus_items?.length || 0;
  const totalFaqs = course?.faqs?.length || 0;
  const totalCriteria = course?.certification_criteria?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in flex items-stretch md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-lowest w-full max-w-5xl md:rounded-2xl shadow-modal overflow-hidden flex flex-col animate-slide-up max-h-screen md:max-h-[92vh]"
      >
        {/* Hero banner */}
        <div className="relative h-56 md:h-72 bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container flex-shrink-0">
          {course?.banner_url && (
            <img
              src={course.banner_url}
              alt={course.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 grid place-items-center rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition-colors z-10"
            aria-label="Close"
          >
            <span className="icon">close</span>
          </button>

          {/* Bottom-aligned hero content */}
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 text-white">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {course?.category && (
                <span className="text-label uppercase tracking-wider opacity-90">{course.category}</span>
              )}
              {course && (
                <>
                  <span className="opacity-50">·</span>
                  <span className="text-label uppercase tracking-wider opacity-90">
                    {course.course_type === "self_paced" ? "Self-paced" : "Live cohort"}
                  </span>
                  <span className="opacity-50">·</span>
                  <span className="text-label uppercase tracking-wider opacity-90">
                    {course.duration_value} {course.duration_unit}
                  </span>
                </>
              )}
            </div>
            <h2 className="font-display font-bold text-display-md md:text-display-lg leading-tight drop-shadow-lg">
              {course?.title || (loading ? "Loading…" : "Course")}
            </h2>
          </div>
        </div>

        {/* Status / price bar */}
        {course && (
          <div className="px-5 md:px-8 py-3 border-b border-ink-outlineVariant/30 bg-surface-containerLow flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge tone={course.is_published ? "success" : "neutral"}>
                {course.is_published ? "Published" : "Draft"}
              </Badge>
              {(course.tags || []).slice(0, 4).map((t) => (
                <Badge key={t} tone="primary">{t}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                {hasDiscount && (
                  <p className="text-label text-ink-outline line-through font-mono">
                    {formatCurrency(Number(course.price))}
                  </p>
                )}
                <p className="font-display font-bold text-title-lg text-primary">
                  {formatCurrency(finalPrice)}
                </p>
              </div>
              {onTogglePublish && (
                <Button
                  size="sm"
                  variant={course.is_published ? "outline" : "primary"}
                  loading={busyToggle}
                  onClick={async () => {
                    setBusyToggle(true);
                    try {
                      await onTogglePublish(course);
                    } finally {
                      setBusyToggle(false);
                    }
                  }}
                >
                  {course.is_published ? "Unpublish" : "Publish"}
                </Button>
              )}
              {onEdit && (
                <Button size="sm" variant="ghost" leftIcon="edit" onClick={() => onEdit(course.id)}>
                  Edit
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        {course && (
          <div className="px-5 md:px-8 border-b border-ink-outlineVariant/30 flex gap-1 overflow-x-auto scrollbar-thin flex-shrink-0">
            {[
              { id: "overview" as const, label: "Overview", icon: "info" },
              { id: "syllabus" as const, label: "Syllabus", icon: "list_alt" },
              { id: "faqs" as const, label: "FAQs", icon: "help_outline" },
              { id: "certificate" as const, label: "Certificate", icon: "workspace_premium" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 h-11 text-body-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-ink-variant hover:text-ink"
                }`}
              >
                <span className="icon text-[16px]">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 md:p-8">
          {loading && <p className="text-body-sm text-ink-outline">Loading course…</p>}
          {!loading && !course && <p className="text-body-sm text-ink-outline">Course not found.</p>}
          {course && activeTab === "overview" && (
            <div className="space-y-6">
              <section>
                <h3 className="text-title-md font-semibold text-ink mb-2">About this course</h3>
                <RichTextView html={course.description} fallback="No description added yet." />
              </section>
              {course.syllabus_pdf_url && (
                <a
                  href={course.syllabus_pdf_url}
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
                  <p className="text-label text-ink-outline mb-2 uppercase tracking-wide">All tags</p>
                  <div className="flex flex-wrap gap-2">
                    {course.tags.map((t) => (
                      <Badge key={t} tone="neutral">{t}</Badge>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {course && activeTab === "syllabus" && (
            <div className="space-y-3">
              {totalSyllabus === 0 ? (
                <p className="text-body-sm text-ink-outline">No syllabus items added yet.</p>
              ) : (
                course.syllabus_items
                  .slice()
                  .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                  .map((s: any, i: number) => (
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
                        <span className="icon text-ink-outline transition-transform group-open:rotate-180">
                          expand_more
                        </span>
                      </summary>
                      <div className="px-4 pb-4 pl-[60px]">
                        <RichTextView html={s.description} fallback="No description for this module." />
                      </div>
                    </details>
                  ))
              )}
            </div>
          )}

          {course && activeTab === "faqs" && (
            <div className="space-y-3">
              {totalFaqs === 0 ? (
                <p className="text-body-sm text-ink-outline">No FAQs added yet.</p>
              ) : (
                course.faqs
                  .slice()
                  .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                  .map((f: any, i: number) => (
                    <details
                      key={i}
                      className="group bg-surface-containerLow rounded-xl border border-ink-outlineVariant/40 overflow-hidden"
                    >
                      <summary className="cursor-pointer list-none p-4 flex items-center justify-between gap-3 hover:bg-surface-container transition-colors">
                        <span className="font-medium text-ink">{f.question}</span>
                        <span className="icon text-ink-outline transition-transform group-open:rotate-180">
                          expand_more
                        </span>
                      </summary>
                      <div className="px-4 pb-4">
                        <p className="text-body-sm text-ink-variant whitespace-pre-line">{f.answer}</p>
                      </div>
                    </details>
                  ))
              )}
            </div>
          )}

          {course && activeTab === "certificate" && (
            <div className="space-y-3">
              <p className="text-body-sm text-ink-variant">
                Students must meet the following criteria to receive a certificate of completion:
              </p>
              {totalCriteria === 0 ? (
                <p className="text-body-sm text-ink-outline">No criteria added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {course.certification_criteria
                    .slice()
                    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                    .map((c: any, i: number) => (
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
          )}
        </div>
      </div>
    </div>
  );
}
