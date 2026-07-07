import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { qk } from "@/lib/queryKeys";
import { fetchPendingAttendance, type PendingAttendanceItem } from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";

const DISMISS_PREFIX = "attn_prompt_dismissed:";

function isDismissed(sessionId: string): boolean {
  try {
    return localStorage.getItem(DISMISS_PREFIX + sessionId) !== null;
  } catch {
    return false;
  }
}

function dismiss(sessionId: string) {
  try {
    localStorage.setItem(DISMISS_PREFIX + sessionId, new Date().toISOString());
  } catch {
    // localStorage unavailable — the banner just reappears next load
  }
}

/**
 * Shown across the instructor portal whenever a live session has ended but
 * its attendance hasn't been marked yet. One click jumps to the Attendance
 * page with that session's roster opened.
 */
export function PendingAttendanceBanner() {
  const navigate = useNavigate();
  const { setSelectedBatchId } = useSelectedBatch();
  const [dismissedTick, setDismissedTick] = useState(0);

  const { data } = useQuery({
    queryKey: qk.instructor.pendingAttendance(),
    queryFn: fetchPendingAttendance,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  // dismissedTick forces a re-filter after a dismissal without refetching.
  void dismissedTick;
  const pending = (data ?? []).filter((p) => !isDismissed(p.session_id));
  if (pending.length === 0) return null;

  const first = pending[0];

  const markNow = (item: PendingAttendanceItem) => {
    setSelectedBatchId(item.batch_id);
    navigate(`/instructor/attendance?session=${item.session_id}&batch=${item.batch_id}`);
  };

  return (
    <div className="mx-4 md:mx-6 lg:mx-8 mt-4 rounded-xl border border-primary/40 bg-primary-container/20 p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <span className="icon text-[24px] text-primary mt-0.5">fact_check</span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            Session ended — attendance not marked
          </p>
          <p className="text-body-sm text-ink-variant truncate">
            {first.session_title} · {first.batch_name} ·{" "}
            {new Date(first.scheduled_at).toLocaleString()}
            {pending.length > 1 && ` — and ${pending.length - 1} more session(s)`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" leftIcon="how_to_reg" onClick={() => markNow(first)}>
          Mark now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            dismiss(first.session_id);
            setDismissedTick((t) => t + 1);
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
