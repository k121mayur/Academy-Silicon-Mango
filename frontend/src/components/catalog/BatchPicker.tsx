import { useState } from "react";
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
  const openBatches = batches.filter(isBatchSelectable);
  return (
    <div className="space-y-3">
      {openBatches.map((b) => (
        <BatchOption
          key={b.id}
          batch={b}
          selected={selected === b.id}
          onSelect={() => onSelect(b.id)}
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
  const [showAllSlots, setShowAllSlots] = useState(false);
  const full = batch.is_full;
  const closed = !batch.enrollment_open;
  const disabled = full || closed;

  const rawSlots = batch.schedule_slots || [];
  const sortedSlots = [...rawSlots].sort((a, b) => {
    if (a.slot_date && b.slot_date) return a.slot_date.localeCompare(b.slot_date);
    if (a.weekday != null && b.weekday != null) return a.weekday - b.weekday;
    return 0;
  });
  const visibleSlots = showAllSlots ? sortedSlots : sortedSlots.slice(0, 5);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`group w-full text-left p-4 rounded-2xl border-2 transition-all ${
        selected
          ? "ring-2 ring-primary border-primary bg-primary-container/25 shadow-card"
          : "bg-surface-lowest border-ink-outlineVariant/40 hover:border-primary/60 hover:bg-primary-container/5 hover:shadow-card"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-title-md font-bold text-ink">{batch.name}</p>
            {selected && (
              <Badge tone="primary" icon="check_circle">Selected</Badge>
            )}
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
          {sortedSlots.length > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-label font-medium text-ink-outline">Class schedule:</span>
                {sortedSlots.length > 5 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllSlots((prev) => !prev);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setShowAllSlots((prev) => !prev);
                      }
                    }}
                    className="inline-flex items-center gap-0.5 text-label font-semibold text-primary hover:underline cursor-pointer"
                  >
                    {showAllSlots ? "Show fewer" : `+${sortedSlots.length - 5} more dates`}
                    <span className="icon text-[16px]">{showAllSlots ? "expand_less" : "expand_more"}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleSlots.map((s, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-surface-container text-label text-ink-variant"
                  >
                    {slotLabel(s)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className={`icon text-[24px] shrink-0 transition-colors ${selected ? "text-primary" : "text-ink-outline group-hover:text-primary/70"}`}>
          {selected ? "radio_button_checked" : "radio_button_unchecked"}
        </span>
      </div>
    </button>
  );
}
