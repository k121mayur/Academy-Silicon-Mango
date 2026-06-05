import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { PaymentModal } from "@/components/student/PaymentModal";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { formatCurrency, formatDate, WEEKDAY_LABELS } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import {
  finalPrice,
  getPublicCourse,
  getPublicCourseBatches,
  type PublicBatch,
  type PublicScheduleSlot,
} from "@/services/public.service";

function slotLabel(s: PublicScheduleSlot): string {
  const time = s.start_time && s.end_time ? ` ${s.start_time}–${s.end_time}` : "";
  if (s.slot_type === "weekday" && s.weekday != null && s.weekday >= 0 && s.weekday < 7) {
    return `${WEEKDAY_LABELS[s.weekday]}${time}`;
  }
  if (s.slot_date) return `${formatDate(s.slot_date)}${time}`;
  return time.trim() || "Scheduled";
}

export default function BatchSelection() {
  const { courseId = "" } = useParams();
  const profileComplete = useAuthStore((s) => s.user?.profile_complete ?? false);
  const [selected, setSelected] = useState<string>("");
  const [payOpen, setPayOpen] = useState(false);

  const courseQ = useQuery({
    queryKey: qk.public.course(courseId),
    queryFn: () => getPublicCourse(courseId),
    staleTime: 5 * 60_000,
    enabled: !!courseId,
  });
  const batchesQ = useQuery({
    queryKey: qk.public.courseBatches(courseId),
    queryFn: () => getPublicCourseBatches(courseId),
    enabled: !!courseId,
  });

  const course = courseQ.data;
  const batches = batchesQ.data ?? [];
  const payable = course ? finalPrice(Number(course.price), Number(course.discount || 0)) : 0;
  const selectedBatch = batches.find((b) => b.id === selected);

  const onContinue = () => {
    if (!selected) {
      toast.error("Select a batch to continue.");
      return;
    }
    if (!profileComplete) {
      toast("Complete your profile first.", { icon: "🔒" });
      return;
    }
    setPayOpen(true);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <nav className="text-label text-ink-outline flex items-center gap-1.5 animate-fade-in flex-wrap">
        <Link to={ROUTES.student.explore} className="hover:text-primary">
          Explore
        </Link>
        <span className="icon text-[14px]">chevron_right</span>
        <Link to={ROUTES.student.courseDetails(courseId)} className="hover:text-primary truncate max-w-[40vw]">
          {course?.title ?? "Course"}
        </Link>
        <span className="icon text-[14px]">chevron_right</span>
        <span className="text-ink-variant">Choose a batch</span>
      </nav>

      <div className="animate-slide-up">
        <h1 className="font-display font-bold text-display-md text-ink">Choose your batch</h1>
        <p className="text-body-sm text-ink-variant">
          Pick the schedule that works for you, then continue to secure payment.
        </p>
      </div>

      {batchesQ.isError ? (
        <QueryErrorState error={batchesQ.error} onRetry={() => batchesQ.refetch()} title="Couldn't load batches" />
      ) : batchesQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-surface-container rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon="event_busy"
          title="No open batches yet"
          description="This course doesn't have any batches open for enrolment right now. Check back soon."
        />
      ) : (
        <div className="space-y-3">
          {batches.map((b) => (
            <BatchOption
              key={b.id}
              batch={b}
              selected={selected === b.id}
              onSelect={() => !b.is_full && setSelected(b.id)}
            />
          ))}
        </div>
      )}

      {batches.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-surface-lowest/90 backdrop-blur border border-ink-outlineVariant/40 rounded-2xl shadow-card p-3">
          <div className="px-2">
            <p className="text-label text-ink-outline">Total payable</p>
            <p className="font-display font-bold text-title-lg text-primary">
              {payable === 0 ? "Free" : formatCurrency(payable)}
            </p>
          </div>
          <Button size="lg" rightIcon="arrow_forward" disabled={!selected} onClick={onContinue}>
            Continue to payment
          </Button>
        </div>
      )}

      {course && selectedBatch && (
        <PaymentModal
          open={payOpen}
          onClose={() => setPayOpen(false)}
          courseId={courseId}
          courseTitle={course.title}
          batch={selectedBatch}
          payable={payable}
        />
      )}
    </div>
  );
}

function BatchOption({
  batch,
  selected,
  onSelect,
}: {
  batch: PublicBatch;
  selected: boolean;
  onSelect: () => void;
}) {
  const full = batch.is_full;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={full}
      className={`w-full text-left p-4 rounded-2xl border transition-all ${
        selected
          ? "ring-2 ring-primary bg-primary-container/20 border-primary/40"
          : "bg-surface-lowest border-ink-outlineVariant/40 hover:border-primary/40 hover:shadow-card"
      } ${full ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">{batch.name}</p>
            <Badge tone={batch.delivery_mode === "live" ? "primary" : "tertiary"} icon={batch.delivery_mode === "live" ? "live_tv" : "self_improvement"}>
              {batch.delivery_mode === "live" ? "Live" : "Recorded"}
            </Badge>
            {full ? (
              <Badge tone="danger">Full</Badge>
            ) : batch.seats_left != null ? (
              <Badge tone="neutral">{batch.seats_left} seats left</Badge>
            ) : null}
          </div>
          <p className="text-body-sm text-ink-variant mt-1 flex items-center gap-1.5">
            <span className="icon text-[16px]">date_range</span>
            {batch.start_date ? formatDate(batch.start_date) : "—"} → {batch.end_date ? formatDate(batch.end_date) : "—"}
          </p>
          {batch.instructor_name && (
            <p className="text-label text-ink-outline mt-1">Instructor: {batch.instructor_name}</p>
          )}
          {batch.schedule_slots.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {batch.schedule_slots.slice(0, 5).map((s, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-surface-container text-label text-ink-variant"
                >
                  {slotLabel(s)}
                </span>
              ))}
            </div>
          )}
        </div>
        <span
          className={`icon text-[22px] shrink-0 ${selected ? "text-primary" : "text-ink-outline"}`}
        >
          {selected ? "radio_button_checked" : "radio_button_unchecked"}
        </span>
      </div>
    </button>
  );
}
