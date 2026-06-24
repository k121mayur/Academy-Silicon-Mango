import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
import { groupSessionsByWeekDay } from "@/lib/utils";
import {
  createAssignment,
  deleteAssignment,
  fetchAssignments,
  fetchBatchPlan,
  fetchSessions,
  type InstructorAssignment,
  type InstructorPlanItem,
  type InstructorSession,
} from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { NoBatchSelected } from "./_NoBatch";

const ASSIGNMENT_TYPES = [
  { value: "quiz", label: "Quiz" },
  { value: "pdf_upload", label: "PDF upload" },
  { value: "text_upload", label: "Text upload" },
  { value: "file_upload", label: "File upload (any type)" },
  { value: "link_submission", label: "Link submission" },
];

// Target a new assignment at a specific week (plan) and optionally a day (session).
interface FormTarget {
  planId: string;
  sessionId: string | null;
  defaultDue: string | null; // ISO datetime to seed the due date, or null
  context: string; // human label shown in the modal title
}

export default function CreateAssignmentPage() {
  const { selectedBatchId } = useSelectedBatch();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<InstructorPlanItem[]>([]);
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [assignments, setAssignments] = useState<InstructorAssignment[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<InstructorAssignment | null>(null);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);

  const reload = async () => {
    if (!selectedBatchId) return;
    try {
      const [p, s, a] = await Promise.all([
        fetchBatchPlan(selectedBatchId),
        fetchSessions(selectedBatchId),
        fetchAssignments(selectedBatchId),
      ]);
      setPlans(p);
      setSessions(s);
      setAssignments(a);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  if (!selectedBatchId) return <NoBatchSelected />;

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAssignment(confirmDelete.id);
      toast.success("Assignment deleted");
      setConfirmDelete(null);
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const grouping = groupSessionsByWeekDay(plans, sessions);

  const renderAssignmentRow = (a: InstructorAssignment) => (
    <div key={a.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-surface-containerLow">
      <div className="min-w-0">
        <p className="font-medium text-ink truncate">{a.title}</p>
        <p className="text-label text-ink-outline">
          {a.assignment_type.replace("_", " ")} · {a.max_points ?? "no"} pts · {a.allow_late ? "late allowed" : "no late"} · {a.submission_count} submissions
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {a.due_date && <Badge tone="neutral">Due {new Date(a.due_date).toLocaleString()}</Badge>}
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(a)}>Delete</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Assignments</h1>
          <p className="text-body-sm text-ink-variant">Assign work per day, with due dates tied to each session's date.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/instructor/grading")}>Go to grading</Button>
      </div>

      {plans.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">No plan items in this batch yet. The admin sets up weeks/days in Batch Operations.</p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-5">
        {grouping.weeks.map((wk) => {
          // Week-level assignments: tied to this plan but not to a specific session.
          const weekAssignments = assignments.filter(
            (a) => a.plan_id === wk.planId && !a.session_id
          );
          return (
            <Card key={wk.planId}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge tone="primary">Week {wk.week}</Badge>
                    <p className="text-title-md font-semibold text-ink truncate">{wk.title || `Week ${wk.week}`}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon="add"
                    onClick={() =>
                      setFormTarget({
                        planId: wk.planId,
                        sessionId: null,
                        defaultDue: null,
                        context: `Week ${wk.week} (no specific day)`,
                      })
                    }
                  >
                    Week assignment
                  </Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                {weekAssignments.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-label uppercase tracking-wide text-ink-outline">Week-level</p>
                    {weekAssignments.map(renderAssignmentRow)}
                  </div>
                )}

                {wk.days.length === 0 && (
                  <p className="text-body-sm text-ink-outline">No sessions scheduled this week yet.</p>
                )}

                {wk.days.map((d) => {
                  const dayAssignments = assignments.filter((a) => a.session_id === d.session.id);
                  return (
                    <div key={d.session.id} className="border border-ink-outlineVariant/40 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-body-sm font-semibold text-ink">{d.label}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon="add"
                          onClick={() =>
                            setFormTarget({
                              planId: wk.planId,
                              sessionId: d.session.id,
                              defaultDue: d.session.scheduled_at ?? null,
                              context: d.label,
                            })
                          }
                        >
                          Add assignment
                        </Button>
                      </div>
                      {dayAssignments.length === 0 ? (
                        <p className="text-label text-ink-outline">No assignment for this day yet.</p>
                      ) : (
                        <div className="space-y-1">{dayAssignments.map(renderAssignmentRow)}</div>
                      )}
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {formTarget && selectedBatchId && (
        <AssignmentFormModal
          batchId={selectedBatchId}
          target={formTarget}
          onClose={() => setFormTarget(null)}
          onCreated={() => {
            setFormTarget(null);
            reload();
            toast.success("Assignment created");
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          open
          title="Delete assignment"
          description={`Delete "${confirmDelete.title}"? All submissions for this assignment will also be removed.`}
          destructive
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function AssignmentFormModal({
  batchId,
  target,
  onClose,
  onCreated,
}: {
  batchId: string;
  target: FormTarget;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignmentType, setAssignmentType] = useState("text_upload");
  const [dueDate, setDueDate] = useState(target.defaultDue ? toLocalInput(target.defaultDue) : "");
  const [maxPoints, setMaxPoints] = useState<string>("");
  const [allowLate, setAllowLate] = useState(false);
  const [resourceUrl, setResourceUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");
    if (!assignmentType) return toast.error("Assignment type is required");
    const mp = maxPoints.trim() === "" ? null : parseInt(maxPoints);
    if (mp !== null && (Number.isNaN(mp) || mp < 0)) return toast.error("Max points must be a positive number");
    setSaving(true);
    try {
      // If the instructor supplied a resource URL, prepend it to the description.
      const desc = resourceUrl.trim()
        ? `${description.trim()}\n\nResource: ${resourceUrl.trim()}`
        : description.trim();
      await createAssignment(batchId, {
        plan_id: target.planId,
        session_id: target.sessionId,
        title: title.trim(),
        description: desc,
        assignment_type: assignmentType,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        max_points: mp,
        allow_late: allowLate,
      });
      onCreated();
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
      title={`New assignment — ${target.context}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} leftIcon="add">Create assignment</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label className="text-label text-ink-variant font-medium">Description *</label>
          <textarea
            className="w-full min-h-[100px] mt-1 p-2 border border-ink-outlineVariant rounded-md text-body-sm bg-surface-lowest"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should the student do, and how is it evaluated?"
          />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <Select
            label="Type *"
            value={assignmentType}
            onChange={(e) => setAssignmentType(e.target.value)}
            options={ASSIGNMENT_TYPES}
          />
          <Input label="Due date/time" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Input
            label="Max points"
            type="number"
            value={maxPoints}
            onChange={(e) => setMaxPoints(e.target.value)}
            placeholder="e.g. 100"
          />
        </div>
        <Input
          label="Resource URL (optional)"
          value={resourceUrl}
          onChange={(e) => setResourceUrl(e.target.value)}
          placeholder="Link to the brief, rubric, or starter material"
        />
        <label className="flex items-center gap-2 text-body-sm text-ink">
          <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
          Allow late submissions
        </label>
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}
