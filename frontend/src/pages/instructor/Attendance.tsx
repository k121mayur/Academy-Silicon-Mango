import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { groupSessionsByWeekDay, weekGroupHeaderTitle } from "@/lib/utils";
import {
  fetchAttendance,
  fetchBatchPlan,
  fetchSessions,
  setAttendance,
  type InstructorAttendanceRow,
  type InstructorPlanItem,
  type InstructorSession,
} from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { NoBatchSelected } from "./_NoBatch";

type AttStatus = InstructorAttendanceRow["status"];

const STATUS_SEGMENTS: { value: AttStatus; label: string; activeClass: string }[] = [
  { value: "present", label: "Present", activeClass: "bg-success text-white border-success" },
  { value: "absent", label: "Absent", activeClass: "bg-danger text-white border-danger" },
  { value: "late", label: "Late", activeClass: "bg-primary-fill text-primary-on border-primary-fill" },
  { value: "excused", label: "Excused", activeClass: "bg-secondary text-secondary-on border-secondary" },
];

// Fast one-click marking; clicking the active status again resets to "not marked".
function StatusSegment({ value, onChange }: { value: AttStatus; onChange: (v: AttStatus) => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-ink-outlineVariant divide-x divide-ink-outlineVariant shrink-0">
      {STATUS_SEGMENTS.map((seg) => {
        const active = value === seg.value;
        return (
          <button
            key={seg.value}
            type="button"
            onClick={() => onChange(active ? "not_marked" : seg.value)}
            className={`px-2.5 py-1.5 text-label font-medium transition-colors ${
              active ? seg.activeClass : "bg-surface-lowest text-ink-variant hover:bg-surface-container"
            }`}
            title={seg.label}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AttendancePage() {
  const { selectedBatchId, setSelectedBatchId } = useSelectedBatch();
  const [plans, setPlans] = useState<InstructorPlanItem[]>([]);
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [selected, setSelected] = useState<InstructorSession | null>(null);
  const [rows, setRows] = useState<InstructorAttendanceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchParams] = useSearchParams();
  const rosterRef = useRef<HTMLDivElement | null>(null);

  // Deep link from the "session ended" prompt / reminder email:
  // /instructor/attendance?session=<id>&batch=<id>
  useEffect(() => {
    const batchParam = searchParams.get("batch");
    if (batchParam && batchParam !== selectedBatchId) setSelectedBatchId(batchParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sessionParam = searchParams.get("session");
    if (!sessionParam || sessions.length === 0) return;
    const target = sessions.find((s) => s.id === sessionParam);
    if (target) {
      setSelected(target);
      setTimeout(() => rosterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  useEffect(() => {
    if (!selectedBatchId) return;
    setSelected(null);
    Promise.all([fetchBatchPlan(selectedBatchId), fetchSessions(selectedBatchId)])
      .then(([p, data]) => {
        setPlans(p);
        setSessions(data.filter((s) => s.session_type === "live"));
      })
      .catch((e) => toast.error(extractErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  useEffect(() => {
    if (!selected) {
      setRows([]);
      return;
    }
    fetchAttendance(selected.id)
      .then((d) => setRows(d))
      .catch((e) => toast.error(extractErrorMessage(e)));
  }, [selected]);

  const grouping = useMemo(() => groupSessionsByWeekDay(plans, sessions), [plans, sessions]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) => r.student_name.toLowerCase().includes(q) || r.student_email.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  if (!selectedBatchId) return <NoBatchSelected />;

  const setRow = (idx: number, patch: Partial<InstructorAttendanceRow>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  // Bulk-mark: applies to the rows currently shown (all, or the search subset).
  const markAllShown = (status: AttStatus) => {
    const shownIds = new Set(filtered.map((r) => r.student_id));
    setRows((rs) => rs.map((r) => (shownIds.has(r.student_id) ? { ...r, status } : r)));
  };

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await setAttendance(
        selected.id,
        rows.map((r) => ({ student_id: r.student_id, status: r.status, notes: r.notes ?? undefined }))
      );
      toast.success(`Saved attendance for ${res.saved} student(s)`);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const isPast = (s: InstructorSession) => new Date(s.scheduled_at).getTime() <= Date.now();
  const hasLive = sessions.length > 0;

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Attendance</h1>
        <p className="text-body-sm text-ink-variant">
          Live sessions only. Mark a session once it has taken place — upcoming sessions are locked.
        </p>
      </div>

      {!hasLive && (
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <Badge tone="warning">No live sessions</Badge>
              <p className="text-body-sm text-ink-variant">
                Attendance is only available for live sessions. Add one in Sessions &amp; Resources.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Week → Day picker */}
      {hasLive && (
        <div className="space-y-4">
          {grouping.weeks.map((wk) => {
            const headerTitle = weekGroupHeaderTitle(wk, grouping.unit);
            return (
            <Card key={wk.planId}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{wk.groupLabel}</Badge>
                  {headerTitle && (
                    <p className="text-title-md font-semibold text-ink truncate">{headerTitle}</p>
                  )}
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                {wk.days.length === 0 && (
                  <p className="text-body-sm text-ink-outline">
                    No live sessions this {grouping.unit === "days" ? "day" : "week"}.
                  </p>
                )}
                {wk.days.map((d) => {
                  const past = isPast(d.session);
                  const active = selected?.id === d.session.id;
                  return (
                    <div
                      key={d.session.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg ${active ? "bg-primary-container/40 ring-1 ring-primary" : "bg-surface-containerLow"}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{d.label || wk.groupLabel}</p>
                        {d.session.title !== wk.title && (
                          <p className="text-label text-ink-outline truncate">{d.session.title}</p>
                        )}
                      </div>
                      {past ? (
                        <Button
                          size="sm"
                          variant={active ? "primary" : "outline"}
                          leftIcon="how_to_reg"
                          onClick={() => setSelected(d.session)}
                        >
                          {active ? "Marking" : "Mark attendance"}
                        </Button>
                      ) : (
                        <Badge tone="neutral">Not yet conducted</Badge>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
            );
          })}

          {grouping.ungrouped.filter((s) => s.session_type === "live").length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge tone="tertiary">Other</Badge>
                  <p className="text-title-md font-semibold text-ink">Manual / unplanned sessions</p>
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                {grouping.ungrouped.map((s) => {
                  const past = isPast(s);
                  const active = selected?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg ${active ? "bg-primary-container/40 ring-1 ring-primary" : "bg-surface-containerLow"}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink truncate">{s.title}</p>
                        <p className="text-label text-ink-outline truncate">{new Date(s.scheduled_at).toLocaleString()}</p>
                      </div>
                      {past ? (
                        <Button
                          size="sm"
                          variant={active ? "primary" : "outline"}
                          leftIcon="how_to_reg"
                          onClick={() => setSelected(s)}
                        >
                          {active ? "Marking" : "Mark attendance"}
                        </Button>
                      ) : (
                        <Badge tone="neutral">Not yet conducted</Badge>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Roster for the selected session */}
      {selected && (
        <div ref={rosterRef}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-title-md font-semibold">{selected.title}</p>
                <p className="text-label text-ink-outline">
                  {new Date(selected.scheduled_at).toLocaleString()} · {rows.length} students
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by name or email"
                />
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon="done_all"
                  onClick={() => markAllShown("present")}
                >
                  {filter.trim() ? `Mark ${filtered.length} shown present` : "Mark all present"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon="remove_done"
                  onClick={() => markAllShown("absent")}
                >
                  {filter.trim() ? `Mark ${filtered.length} shown absent` : "Mark all absent"}
                </Button>
                <Button onClick={submit} loading={saving} leftIcon="save">Save all</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-body-sm text-ink-outline">No students enrolled in this batch yet.</p>
            )}
            {filtered.map((r) => {
              const origIdx = rows.findIndex((rr) => rr.student_id === r.student_id);
              return (
                <div key={r.student_id} className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-3 p-3 rounded-lg bg-surface-containerLow">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{r.student_name}</p>
                    <p className="text-label text-ink-outline truncate">{r.student_email}</p>
                  </div>
                  <StatusSegment
                    value={r.status}
                    onChange={(v) => setRow(origIdx, { status: v })}
                  />
                  <Input
                    value={r.notes ?? ""}
                    onChange={(e) => setRow(origIdx, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                  />
                </div>
              );
            })}
          </CardBody>
        </Card>
        </div>
      )}

      {selected && rows.length > 0 && (
        <p className="text-label text-ink-outline">
          {rows.filter((r) => r.status === "present").length} present ·{" "}
          {rows.filter((r) => r.status === "absent").length} absent ·{" "}
          {rows.filter((r) => r.status === "late").length} late ·{" "}
          {rows.filter((r) => r.status === "excused").length} excused ·{" "}
          {rows.filter((r) => r.status === "not_marked").length} not marked
        </p>
      )}
    </div>
  );
}
