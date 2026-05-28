import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
import {
  completeStudents,
  fetchBatchStudents,
  resendCertificates,
  type InstructorStudent,
} from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { NoBatchSelected } from "./_NoBatch";

export default function CompletionPage() {
  const { selectedBatchId } = useSelectedBatch();
  const [students, setStudents] = useState<InstructorStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const data = await fetchBatchStudents(selectedBatchId);
      setStudents(data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.student_name.toLowerCase().includes(q) || s.student_email.toLowerCase().includes(q)
    );
  }, [students, filter]);

  if (!selectedBatchId) return <NoBatchSelected />;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllActive = () => {
    setSelected(new Set(filtered.filter((s) => s.status === "active").map((s) => s.student_id)));
  };

  const doComplete = async () => {
    setConfirmComplete(false);
    if (selected.size === 0) return toast.error("Select at least one student");
    setBusy(true);
    try {
      const res = await completeStudents(selectedBatchId, Array.from(selected));
      if (res.failed > 0) {
        toast.error(
          `${res.completed} completed, ${res.failed} failed:\n${(res.errors || []).slice(0, 3).join("; ")}`
        );
      } else {
        toast.success(`Marked ${res.completed} student(s) complete · batch is now ${res.batch_status}`);
      }
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doResend = async () => {
    setConfirmResend(false);
    if (selected.size === 0) return toast.error("Select at least one student");
    setBusy(true);
    try {
      const res = await resendCertificates(selectedBatchId, Array.from(selected));
      toast.success(`Re-sent ${res.resent} cert(s)${res.failed > 0 ? ` · ${res.failed} failed` : ""}`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Completion</h1>
        <p className="text-body-sm text-ink-variant">
          Mark students complete to generate and email their certificates. Re-release for any whose
          email failed. Completing a student locks teaching updates for them.
        </p>
      </div>

      <Card>
        <CardBody className="grid md:grid-cols-3 gap-3">
          <Input
            label="Search students"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name or email"
          />
          <div className="flex items-end gap-2">
            <Button size="sm" variant="outline" onClick={selectAllActive}>Select all active</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button
              variant="outline"
              leftIcon="autorenew"
              onClick={() => setConfirmResend(true)}
              disabled={selected.size === 0 || busy}
            >
              Re-release ({selected.size})
            </Button>
            <Button
              leftIcon="workspace_premium"
              onClick={() => setConfirmComplete(true)}
              disabled={selected.size === 0 || busy}
            >
              Mark complete ({selected.size})
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading && <p className="text-body-sm text-ink-outline">Loading students…</p>}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">
              {students.length === 0 ? "No students enrolled in this batch." : "No students match the filter."}
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">{filtered.length} students</p>
        </CardHeader>
        <CardBody className="space-y-2">
          {filtered.map((s) => {
            const checked = selected.has(s.student_id);
            const isCompleted = s.status === "completed";
            return (
              <label
                key={s.student_id}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  checked ? "bg-primary-container/30" : "bg-surface-containerLow hover:bg-surface-container"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.student_id)}
                  className="w-4 h-4"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{s.student_name}</p>
                  <p className="text-label text-ink-outline truncate">{s.student_email}</p>
                </div>
                <Badge tone={isCompleted ? "success" : s.status === "dropped" ? "danger" : "primary"}>
                  {s.status}
                </Badge>
              </label>
            );
          })}
        </CardBody>
      </Card>

      {confirmComplete && (
        <ConfirmModal
          open
          title={`Mark ${selected.size} student(s) complete?`}
          description="This will generate certificate PDFs, email them to each student, and lock teaching updates for these students. This cannot be undone."
          onConfirm={doComplete}
          onClose={() => setConfirmComplete(false)}
        />
      )}
      {confirmResend && (
        <ConfirmModal
          open
          title={`Re-release certificates for ${selected.size} student(s)?`}
          description="The certificate PDF will be regenerated and re-emailed."
          onConfirm={doResend}
          onClose={() => setConfirmResend(false)}
        />
      )}
    </div>
  );
}
