import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { absoluteApiUrl, extractErrorMessage } from "@/lib/api";
import {
  fetchSubmissions,
  gradeSubmission,
  type InstructorSubmission,
} from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { NoBatchSelected } from "./_NoBatch";

const STATUS = [
  { value: "submitted", label: "Submitted" },
  { value: "graded", label: "Graded" },
  { value: "late", label: "Late" },
  { value: "missing", label: "Missing" },
];

export default function GradingPage() {
  const { selectedBatchId } = useSelectedBatch();
  const [items, setItems] = useState<InstructorSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [grading, setGrading] = useState<InstructorSubmission | null>(null);

  const reload = async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const data = await fetchSubmissions(selectedBatchId);
      setItems(data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  const assignmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => map.set(i.assignment_id, i.assignment_title));
    return [{ value: "", label: "All assignments" }, ...Array.from(map, ([v, l]) => ({ value: v, label: l }))];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(
      (i) =>
        (!assignmentFilter || i.assignment_id === assignmentFilter) &&
        (!statusFilter || i.status === statusFilter)
    );
  }, [items, assignmentFilter, statusFilter]);

  if (!selectedBatchId) return <NoBatchSelected />;

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Submissions & Grading</h1>
        <p className="text-body-sm text-ink-variant">All submissions across all assignments in this batch.</p>
      </div>

      <Card>
        <CardBody className="grid md:grid-cols-3 gap-3">
          <Select label="Assignment" value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} options={assignmentOptions} />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: "", label: "All" }, ...STATUS]}
          />
          <div className="flex items-end">
            <Button variant="outline" onClick={reload} leftIcon="refresh">Refresh</Button>
          </div>
        </CardBody>
      </Card>

      {loading && <p className="text-body-sm text-ink-outline">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">No submissions match.</p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((s) => (
          <Card key={s.id}>
            <CardBody className="grid md:grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-ink truncate">{s.student_name}</p>
                  <Badge tone="neutral">{s.assignment_title}</Badge>
                  <Badge tone={s.status === "graded" ? "success" : s.is_late ? "warning" : "primary"}>
                    {s.status}
                  </Badge>
                  {s.is_late && <Badge tone="warning">late</Badge>}
                </div>
                <p className="text-label text-ink-outline mt-1">
                  Submitted {s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "—"}
                  {s.score !== null && ` · score ${s.score}${s.assignment_max_points ? "/" + s.assignment_max_points : ""}`}
                </p>
                {s.content && <p className="text-body-sm text-ink-variant truncate mt-1">{s.content}</p>}
                <SubmissionFileLinks submission={s} />
              </div>
              <Button
                onClick={() => setGrading(s)}
                leftIcon="grading"
                variant={s.status === "graded" ? "outline" : "primary"}
              >
                {s.status === "graded" ? "Re-Grade" : "Grade"}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {grading && (
        <GradeModal
          submission={grading}
          onClose={() => setGrading(null)}
          onSaved={() => {
            setGrading(null);
            reload();
            toast.success("Saved");
          }}
        />
      )}
    </div>
  );
}

function GradeModal({
  submission,
  onClose,
  onSaved,
}: {
  submission: InstructorSubmission;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<string>(submission.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [status, setStatus] = useState(submission.status);
  // Track whether the instructor explicitly picked a status; otherwise assigning
  // a score flips the submission to "graded" automatically.
  const [statusTouched, setStatusTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!statusTouched && score.trim() !== "" && status !== "graded") {
      setStatus("graded");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, statusTouched]);

  const submit = async () => {
    let s: number | undefined = undefined;
    if (score.trim() !== "") {
      const parsed = parseFloat(score);
      if (Number.isNaN(parsed) || parsed < 0) {
        toast.error("Score must be a non-negative number");
        return;
      }
      if (submission.assignment_max_points !== null && parsed > submission.assignment_max_points) {
        toast.error(`Score cannot exceed ${submission.assignment_max_points}`);
        return;
      }
      s = parsed;
    }
    setSaving(true);
    try {
      await gradeSubmission(submission.id, {
        score: s,
        feedback: feedback.trim() || undefined,
        status: statusTouched ? status : s !== undefined ? "graded" : undefined,
      });
      onSaved();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Grade — ${submission.assignment_title}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save grade</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="p-3 bg-surface-containerLow rounded-md">
          <p className="text-label text-ink-outline">Student</p>
          <p className="font-medium text-ink">{submission.student_name} <span className="text-ink-outline">({submission.student_email})</span></p>
        </div>
        {submission.content && (
          <div>
            <p className="text-label text-ink-outline mb-1">Submitted content</p>
            <pre className="text-body-sm text-ink whitespace-pre-wrap bg-surface-containerLow p-3 rounded-md">{submission.content}</pre>
          </div>
        )}
        <SubmissionFileLinks submission={submission} label="Open submitted file" />
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label={`Score${submission.assignment_max_points ? ` (max ${submission.assignment_max_points})` : ""}`}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            type="number"
            step="0.5"
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatusTouched(true);
              setStatus(e.target.value as any);
            }}
            options={STATUS}
          />
        </div>
        <div>
          <label className="text-label text-ink-variant font-medium">Feedback</label>
          <textarea
            className="w-full min-h-[120px] mt-1 p-2 border border-ink-outlineVariant rounded-md text-body-sm bg-surface-lowest"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function SubmissionFileLinks({ submission, label = "Open file" }: { submission: InstructorSubmission; label?: string }) {
  const urls = submission.file_urls?.length ? submission.file_urls : submission.file_url ? [submission.file_url] : [];
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 mt-1">
      {urls.map((u, i) => (
        <a key={u} href={absoluteApiUrl(u)} target="_blank" rel="noreferrer" className="text-body-sm text-primary hover:underline">
          {urls.length > 1 ? `${label} ${i + 1} ↗` : `${label} ↗`}
        </a>
      ))}
    </div>
  );
}

