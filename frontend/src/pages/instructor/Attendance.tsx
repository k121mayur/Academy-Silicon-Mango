import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import {
  fetchAttendance,
  fetchSessions,
  setAttendance,
  type InstructorAttendanceRow,
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
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [rows, setRows] = useState<InstructorAttendanceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!selectedBatchId) return;
    fetchSessions(selectedBatchId)
      .then((data) => {
        const live = data.filter((s) => s.session_type === "live");
        setSessions(live);
        if (live.length && !sessionId) setSessionId(live[0].id);
      })
      .catch((e) => toast.error(extractErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  useEffect(() => {
    if (!sessionId) {
      setRows([]);
      return;
    }
    fetchAttendance(sessionId)
      .then((d) => setRows(d))
      .catch((e) => toast.error(extractErrorMessage(e)));
  }, [sessionId]);

  if (!selectedBatchId) return <NoBatchSelected />;

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) => r.student_name.toLowerCase().includes(q) || r.student_email.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const setRow = (idx: number, patch: Partial<InstructorAttendanceRow>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      const res = await setAttendance(
        sessionId,
        rows.map((r) => ({ student_id: r.student_id, status: r.status, notes: r.notes ?? undefined }))
      );
      toast.success(`Saved attendance for ${res.saved} student(s)`);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Attendance</h1>
        <p className="text-body-sm text-ink-variant">Available for live sessions only. Saved in one shot for the whole class.</p>
      </div>

      <Card>
        <CardBody>
          <div className="grid md:grid-cols-2 gap-3">
            <Select
              label="Live session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              options={[
                { value: "", label: sessions.length ? "Pick a session" : "No live sessions in this batch" },
                ...sessions.map((s) => ({ value: s.id, label: `${s.title} · ${new Date(s.scheduled_at).toLocaleString()}` })),
              ]}
            />
            <Input
              label="Filter students"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name or email"
            />
          </div>
        </CardBody>
      </Card>

      {sessionId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <p className="text-title-md font-semibold">{rows.length} students</p>
              <Button onClick={submit} loading={saving} leftIcon="save">Save all</Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-body-sm text-ink-outline">No students enrolled in this batch yet.</p>
            )}
            {filtered.map((r, i) => {
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

      {sessionId && rows.length > 0 && (
        <p className="text-label text-ink-outline">
          {rows.filter((r) => r.status === "present").length} present ·{" "}
          {rows.filter((r) => r.status === "absent").length} absent ·{" "}
          {rows.filter((r) => r.status === "late").length} late ·{" "}
          {rows.filter((r) => r.status === "excused").length} excused ·{" "}
          {rows.filter((r) => r.status === "not_marked").length} not marked
        </p>
      )}

      {sessions.length === 0 && selectedBatchId && (
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <Badge tone="warning">No live sessions</Badge>
              <p className="text-body-sm text-ink-variant">
                Attendance is only available for live sessions. Add one in Sessions & Resources.
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
