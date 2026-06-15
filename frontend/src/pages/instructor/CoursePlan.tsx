import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { fetchBatchPlan, type InstructorPlanItem } from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { NoBatchSelected } from "./_NoBatch";

export default function CoursePlan() {
  const { selectedBatchId } = useSelectedBatch();
  const [plan, setPlan] = useState<InstructorPlanItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (showSpinner = true) => {
      if (!selectedBatchId) {
        setPlan([]);
        return;
      }
      if (showSpinner) setLoading(true);
      fetchBatchPlan(selectedBatchId)
        .then((d) => setPlan(d))
        .catch((e) => toast.error(extractErrorMessage(e)))
        .finally(() => setLoading(false));
    },
    [selectedBatchId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Admin owns the plan; re-pull whenever the instructor returns to this tab so
  // their view reflects the latest admin edits without a manual reload.
  useEffect(() => {
    const onFocus = () => load(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (!selectedBatchId) return <NoBatchSelected />;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Course Plan</h1>
          <p className="text-body-sm text-ink-variant">
            Read-only view of the week/day plan, with sessions and assignments under each entry.
            The plan structure itself is owned by the admin.
          </p>
        </div>
        <Button variant="outline" size="sm" leftIcon="refresh" onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading && <p className="text-body-sm text-ink-outline">Loading plan…</p>}

      {!loading && plan.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">
              No plan items yet for this batch. The admin can add weeks/days in Batch Operations.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-3">
        {plan.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Badge tone="primary">#{p.plan_index}</Badge>
                <p className="text-title-md font-semibold text-ink truncate">{p.title || `Item ${p.plan_index}`}</p>
              </div>
              {p.summary && <p className="text-body-sm text-ink-variant mt-1">{p.summary}</p>}
            </CardHeader>
            <CardBody className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-label uppercase tracking-wide text-ink-outline mb-1">Sessions</p>
                {p.sessions.length === 0 ? (
                  <p className="text-body-sm text-ink-outline">No sessions in this week</p>
                ) : (
                  <ul className="space-y-1">
                    {p.sessions.map((s) => (
                      <li key={s.id} className="text-body-sm text-ink flex items-center gap-2">
                        <span className="icon text-ink-outline text-[16px]">event</span>
                        <span className="truncate">{s.title}</span>
                        <span className="text-ink-outline text-label">
                          {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-label uppercase tracking-wide text-ink-outline mb-1">Assignments</p>
                {p.assignments.length === 0 ? (
                  <p className="text-body-sm text-ink-outline">No assignments in this week</p>
                ) : (
                  <ul className="space-y-1">
                    {p.assignments.map((a) => (
                      <li key={a.id} className="text-body-sm text-ink flex items-center gap-2">
                        <span className="icon text-ink-outline text-[16px]">assignment</span>
                        <span className="truncate">{a.title}</span>
                        <Badge tone="neutral">{a.assignment_type.replace("_", " ")}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
