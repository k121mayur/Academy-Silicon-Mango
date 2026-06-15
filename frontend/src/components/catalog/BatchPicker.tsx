import { Badge } from "@/components/ui/Badge";
import { formatDate, WEEKDAY_LABELS } from "@/lib/utils";
import type { PublicBatch, PublicScheduleSlot } from "@/services/public.service";

export function slotLabel(s: PublicScheduleSlot): string {
  const time = s.start_time && s.end_time ? ` ${s.start_time}–${s.end_time}` : "";
  if (s.slot_type === "weekday" && s.weekday != null && s.weekday >= 0 && s.weekday < 7) {
    return `${WEEKDAY_LABELS[s.weekday]}${time}`;
  }
  if (s.slot_date) return `${formatDate(s.slot_date)}${time}`;
  return time.trim() || "Scheduled";
}

/** A batch can't be picked when it's full OR its enrollment window has closed. */
export function isBatchSelectable(b: PublicBatch): boolean {
  return !b.is_full && b.enrollment_open;
}

interface BatchPickerProps {
  batches: PublicBatch[];
  selected: string;
  onSelect: (id: string) => void;
}

export function BatchPicker({ batches, selected, onSelect }: BatchPickerProps) {
  return (
    <div className="space-y-3">
      {batches.map((b) => (
        <BatchOption
          key={b.id}
          batch={b}
          selected={selected === b.id}
          onSelect={() => isBatchSelectable(b) && onSelect(b.id)}
        />
      ))}
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
  const closed = !batch.enrollment_open;
  const disabled = full || closed;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left p-4 rounded-2xl border transition-all ${
        selected
          ? "ring-2 ring-primary bg-primary-container/20 border-primary/40"
          : "bg-surface-lowest border-ink-outlineVariant/40 hover:border-primary/40 hover:shadow-card"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">{batch.name}</p>
            <Badge
              tone={batch.delivery_mode === "live" ? "primary" : "tertiary"}
              icon={batch.delivery_mode === "live" ? "live_tv" : "self_improvement"}
            >
              {batch.delivery_mode === "live" ? "Live" : "Recorded"}
            </Badge>
            {full ? (
              <Badge tone="danger">Full</Badge>
            ) : closed ? (
              <Badge tone="neutral">Enrollment closed</Badge>
            ) : batch.seats_left != null ? (
              <Badge tone="neutral">{batch.seats_left} seats left</Badge>
            ) : null}
          </div>
          <p className="text-body-sm text-ink-variant mt-1 flex items-center gap-1.5">
            <span className="icon text-[16px]">date_range</span>
            {batch.start_date ? formatDate(batch.start_date) : "—"} →{" "}
            {batch.end_date ? formatDate(batch.end_date) : "—"}
          </p>
          {batch.instructor_name && (
            <p className="text-label text-ink-outline mt-1">Instructor: {batch.instructor_name}</p>
          )}
          {!full && closed && batch.enrollment_closes_on && (
            <p className="text-label text-ink-outline mt-1">
              Enrollment closed on {formatDate(batch.enrollment_closes_on)}
            </p>
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
        <span className={`icon text-[22px] shrink-0 ${selected ? "text-primary" : "text-ink-outline"}`}>
          {selected ? "radio_button_checked" : "radio_button_unchecked"}
        </span>
      </div>
    </button>
  );
}
