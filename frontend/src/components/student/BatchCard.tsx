import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { absoluteApiUrl } from "@/lib/api";
import { ROUTES } from "@/router/routes";
import type { BatchProgress, StudentBatch } from "@/services/student.service";

export function BatchCard({
  batch,
  progress,
  loadingProgress,
}: {
  batch: StudentBatch;
  progress?: BatchProgress;
  loadingProgress?: boolean;
}) {
  const navigate = useNavigate();
  const recorded = batch.delivery_mode === "recorded";
  const open = () =>
    navigate(recorded ? ROUTES.student.selfPaced(batch.id) : ROUTES.student.batchWorkspace(batch.id));

  const pct = progress?.overall_percent ?? 0;
  const completed = batch.enrollment_status === "completed";

  return (
    <article className="bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl shadow-card overflow-hidden flex flex-col transition-all hover:shadow-modal hover:-translate-y-0.5">
      {/* Banner strip */}
      <div className="relative h-28 bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container">
        {batch.course_banner && (
          <img
            src={absoluteApiUrl(batch.course_banner)}
            alt={batch.course_title ?? ""}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between gap-2">
          <Badge tone={recorded ? "tertiary" : "primary"} icon={recorded ? "self_improvement" : "live_tv"}>
            {recorded ? "Recorded" : "Live"}
          </Badge>
          <Badge tone={completed ? "success" : "neutral"}>{batch.enrollment_status}</Badge>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-semibold text-title-md text-ink line-clamp-2">{batch.course_title}</h3>
        <p className="text-label text-ink-outline mt-0.5">{batch.name}</p>
        <p className="text-label text-ink-outline mt-1 flex items-center gap-1">
          <span className="icon text-[14px]">date_range</span>
          {batch.start_date ? formatDate(batch.start_date) : "—"} → {batch.end_date ? formatDate(batch.end_date) : "—"}
        </p>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label text-ink-variant">Progress</span>
            {loadingProgress ? (
              <span className="h-3 w-8 bg-surface-container rounded animate-pulse inline-block" />
            ) : (
              <span className="text-label font-semibold text-primary">{pct}%</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${completed ? "bg-success" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Counts */}
        {progress && (
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <Stat icon="event" label="Sessions" value={`${progress.sessions.done}/${progress.sessions.total}`} />
            <Stat
              icon="assignment"
              label="Graded"
              value={`${progress.assignments.graded}/${progress.assignments.total}`}
            />
            <Stat
              icon="fact_check"
              label="Attended"
              value={`${progress.attendance.present}/${progress.attendance.total}`}
            />
          </div>
        )}

        <Button
          className="mt-4"
          fullWidth
          variant={recorded ? "primary" : "outline"}
          leftIcon={recorded ? "play_circle" : "open_in_new"}
          onClick={open}
        >
          {recorded ? "Open lessons" : "Open workspace"}
        </Button>
      </div>
    </article>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-surface-containerLow rounded-lg py-2">
      <span className="icon text-[16px] text-ink-outline">{icon}</span>
      <p className="text-body-sm font-semibold text-ink leading-tight">{value}</p>
      <p className="text-caption text-ink-outline">{label}</p>
    </div>
  );
}
