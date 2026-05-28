import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
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

export default function CreateAssignmentPage() {
  const { selectedBatchId } = useSelectedBatch();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<InstructorPlanItem[]>([]);
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [assignments, setAssignments] = useState<InstructorAssignment[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<InstructorAssignment | null>(null);

  // form
  const [planId, setPlanId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignmentType, setAssignmentType] = useState("text_upload");
  const [dueDate, setDueDate] = useState("");
  const [maxPoints, setMaxPoints] = useState<string>("");
  const [allowLate, setAllowLate] = useState(false);
  const [resourceUrl, setResourceUrl] = useState("");
  const [saving, setSaving] = useState(false);

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

  const submit = async () => {
    if (!planId) return toast.error("Week / plan is required");
    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");
    if (!assignmentType) return toast.error("Assignment type is required");
    const mp = maxPoints.trim() === "" ? null : parseInt(maxPoints);
    if (mp !== null && (Number.isNaN(mp) || mp < 0)) return toast.error("Max points must be a positive number");
    setSaving(true);
    try {
      // If the instructor supplied a resource URL, prepend it to the description
      const desc =
        resourceUrl.trim()
          ? `${description.trim()}\n\nResource: ${resourceUrl.trim()}`
          : description.trim();
      await createAssignment(selectedBatchId, {
        plan_id: planId,
        session_id: sessionId || null,
        title: title.trim(),
        description: desc,
        assignment_type: assignmentType,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        max_points: mp,
        allow_late: allowLate,
      });
      toast.success("Assignment created");
      setTitle("");
      setDescription("");
      setDueDate("");
      setMaxPoints("");
      setAllowLate(false);
      setResourceUrl("");
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Create Assignment</h1>
          <p className="text-body-sm text-ink-variant">Add an assignment for the current batch.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/instructor/grading")}>Go to grading</Button>
      </div>

      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">New assignment</p>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <Select
              label="Week / plan *"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              options={[
                { value: "", label: plans.length ? "Pick a week" : "No plan items in this batch" },
                ...plans.map((p) => ({ value: p.id, label: `Week ${p.plan_index + 1} — ${p.title || "untitled"}` })),
              ]}
            />
            <Select
              label="Linked session (optional)"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              options={[
                { value: "", label: "None" },
                ...sessions.map((s) => ({ value: s.id, label: `${s.title} · ${new Date(s.scheduled_at).toLocaleDateString()}` })),
              ]}
            />
          </div>
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
        </CardBody>
        <div className="p-5 border-t border-ink-outlineVariant/30 flex justify-end gap-2">
          <Button onClick={submit} loading={saving} leftIcon="add">Create assignment</Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">Existing assignments</p>
        </CardHeader>
        <CardBody className="space-y-2">
          {assignments.length === 0 && <p className="text-body-sm text-ink-outline">None yet.</p>}
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-containerLow">
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">{a.title}</p>
                <p className="text-label text-ink-outline">
                  {a.assignment_type.replace("_", " ")} · {a.max_points ?? "no"} pts · {a.allow_late ? "late allowed" : "no late"} · {a.submission_count} submissions
                </p>
              </div>
              <div className="flex items-center gap-2">
                {a.due_date && <Badge tone="neutral">Due {new Date(a.due_date).toLocaleDateString()}</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(a)}>Delete</Button>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

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
