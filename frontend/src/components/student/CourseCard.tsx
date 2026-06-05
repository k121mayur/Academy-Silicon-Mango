import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { absoluteApiUrl } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import {
  finalPrice,
  getPublicCourse,
  getPublicCourseBatches,
  type PublicCourseListItem,
} from "@/services/public.service";
import { stripHtml } from "@/components/shared/RichTextView";

export function CourseCard({ course }: { course: PublicCourseListItem }) {
  const price = Number(course.price);
  const discount = Number(course.discount || 0);
  const payable = finalPrice(price, discount);
  const hasDiscount = discount > 0;
  const preview = stripHtml(course.description || "");

  // Prefetch detail + batches so navigation feels instant.
  const prefetch = () => {
    queryClient.prefetchQuery({ queryKey: qk.public.course(course.id), queryFn: () => getPublicCourse(course.id) });
    queryClient.prefetchQuery({
      queryKey: qk.public.courseBatches(course.id),
      queryFn: () => getPublicCourseBatches(course.id),
    });
  };

  return (
    <Link
      to={ROUTES.student.courseDetails(course.id)}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="group relative bg-surface-lowest rounded-2xl overflow-hidden border border-ink-outlineVariant/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-modal hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex flex-col"
    >
      {/* Banner */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container">
        {course.banner_url ? (
          <img
            src={absoluteApiUrl(course.banner_url)}
            alt={course.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-primary-onContainer opacity-50">
            <span className="icon text-[56px]">menu_book</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          {course.category && (
            <span className="px-2.5 py-1 rounded-full text-label font-medium bg-white/95 text-ink backdrop-blur-sm shadow-sm">
              {course.category}
            </span>
          )}
          {course.batches_count > 0 && (
            <span className="px-2.5 py-1 rounded-full text-label font-medium bg-white/90 text-ink-variant backdrop-blur-sm shadow-sm inline-flex items-center gap-1">
              <span className="icon text-[13px]">groups_2</span>
              {course.batches_count} {course.batches_count === 1 ? "batch" : "batches"}
            </span>
          )}
        </div>
        {hasDiscount && (
          <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-label font-semibold bg-danger text-white shadow-md">
            {discount}% OFF
          </span>
        )}
        {/* Reveal-on-hover CTA bar */}
        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-black/55 backdrop-blur-sm text-white text-body-sm font-medium py-2 text-center">
          View details →
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-semibold text-title-md text-ink line-clamp-2 group-hover:text-primary transition-colors min-h-[3rem]">
          {course.title}
        </h3>
        <p className="text-body-sm text-ink-variant line-clamp-2 mt-1.5 min-h-[2.5rem]">{preview || "—"}</p>

        {(course.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {course.tags.slice(0, 3).map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
            {course.tags.length > 3 && (
              <span className="text-label text-ink-outline self-center">+{course.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink-outlineVariant/30">
          <div className="flex items-center gap-3 text-body-sm text-ink-variant">
            <span className="flex items-center gap-1">
              <span className="icon text-[16px]">schedule</span>
              {course.duration_value} {course.duration_unit}
            </span>
            <span className="flex items-center gap-1">
              <span className="icon text-[16px]">
                {course.course_type === "self_paced" ? "self_improvement" : "live_tv"}
              </span>
              {course.course_type === "self_paced" ? "Self-paced" : "Live"}
            </span>
          </div>
          <div className="text-right">
            {hasDiscount && (
              <p className="text-label text-ink-outline line-through font-mono leading-tight">
                {formatCurrency(price)}
              </p>
            )}
            <p className="font-display font-bold text-title-md text-primary leading-tight">
              {payable === 0 ? "Free" : formatCurrency(payable)}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="bg-surface-containerLow rounded-2xl overflow-hidden animate-pulse">
      <div className="h-44 bg-surface-container" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-surface-container rounded w-3/4" />
        <div className="h-3 bg-surface-container rounded w-full" />
        <div className="h-3 bg-surface-container rounded w-2/3" />
        <div className="h-8 bg-surface-container rounded w-full mt-2" />
      </div>
    </div>
  );
}
