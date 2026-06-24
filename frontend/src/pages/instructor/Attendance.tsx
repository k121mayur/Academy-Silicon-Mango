import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { groupSessionsByWeekDay } from "@/lib/utils";
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

const STATUS = [
  { value: "not_marked", label: "Not marked" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

export default function AttendancePage() {
  const { selectedBatchId } = useSelectedBatch();
  const [plans, setPlans] = useState<InstructorPlanItem[]>([]);
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [selected, setSelected] = useState<InstructorSession | null>(null);
  const [rows, setRows] = useState<InstructorAttendanceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

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
          {grouping.weeks.map((wk) => (
            <Card key={wk.planId}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">Week {wk.week}</Badge>
                  <p className="text-title-md font-semibold text-ink truncate">{wk.title || `Week ${wk.week}`}</p>
                </div>
              </CardHeader>
              <CardBody className="space-y-2">
                {wk.days.length === 0 && (
                  <p className="text-body-sm text-ink-outline">No live sessions this week.</p>
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
                        <p className="font-medium text-ink truncate">Week {wk.week} {d.label}</p>
                        <p className="text-label text-ink-outline truncate">{d.session.title}</p>
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
          ))}

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-title-md font-semibold">{selected.title}</p>
                <p className="text-label text-ink-outline">
                  {new Date(selected.scheduled_at).toLocaleString()} · {rows.length} students
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by name or email"
                />
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
                <div key={r.student_id} className="grid md:grid-cols-[1fr_160px_1fr] items-center gap-3 p-3 rounded-lg bg-surface-containerLow">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{r.student_name}</p>
                    <p className="text-label text-ink-outline truncate">{r.student_email}</p>
                  </div>
                  <Select
                    value={r.status}
                    onChange={(e) => setRow(origIdx, { status: e.target.value as any })}
                    options={STATUS}
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
