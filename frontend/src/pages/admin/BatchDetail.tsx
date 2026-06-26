import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Select } from "@/components/ui/Select";
import {
  getBatch,
  batchPlans,
  updateBatchPlans,
  syncBatchSessions,
  batchEnrollments,
  batchEnroll,
  batchRemoveEnrollment,
  completeBatch,
  updateBatch,
  deleteBatch,
  listAllStudents,
  listInstructors,
  batchAssignInstructor,
  StudentDTO,
} from "@/services/admin.service";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function BatchDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<any>(null);
  const [tab, setTab] = useState<"overview" | "plan" | "enrollments">("overview");
  const [plans, setPlans] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<StudentDTO[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [enrollStudentId, setEnrollStudentId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", start_date: "", end_date: "", capacity: "", status: "upcoming" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignInstructorOpen, setAssignInstructorOpen] = useState(false);
  const [instructorOptions, setInstructorOptions] = useState<any[]>([]);
  const [instructorSearch, setInstructorSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  const refresh = async () => {
    if (!id) return;
    try {
      const [b, p, e] = await Promise.all([getBatch(id), batchPlans(id), batchEnrollments(id)]);
      setBatch(b);
      setPlans(p);
      setEnrollments(e);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const savePlans = async () => {
    if (!id) return;
    try {
      await updateBatchPlans(id, plans.map((p) => ({ plan_index: p.plan_index, title: p.title, summary: p.summary })));
      toast.success("Plans updated");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onSync = async () => {
    if (!id) return;
    try {
      const res = await syncBatchSessions(id);
      toast.success(`Synced — created ${res.sessions_created} sessions`);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  useEffect(() => {
    if (!enrollOpen) {
      setEnrollStudentId(null);
      return;
    }
    setStudentsLoading(true);
    listAllStudents()
      .then(setAllStudents)
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setStudentsLoading(false));
  }, [enrollOpen]);

  const enroll = async () => {
    if (!id || !enrollStudentId) return;
    setEnrolling(true);
    try {
      await batchEnroll(id, enrollStudentId);
      toast.success("Student enrolled");
      setEnrollOpen(false);
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setEnrolling(false);
    }
  };

  const openAssignInstructor = async () => {
    try {
      const res = await listInstructors({ limit: 100 });
      setInstructorOptions(res.data);
      setInstructorSearch("");
      setAssignInstructorOpen(true);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const assignInstructor = async (instructorUserId: string | null) => {
    if (!id) return;
    setAssigning(true);
    try {
      await batchAssignInstructor(id, instructorUserId ?? "");
      toast.success(instructorUserId ? "Instructor assigned" : "Instructor cleared");
      setAssignInstructorOpen(false);
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  };

  const onComplete = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const result = await completeBatch(id);
      const c = result.certificates;
      if (c.template_missing) {
        toast.error("Batch locked but no certificate template — upload one to email certs");
      } else if (c.emailed > 0 && c.failed === 0) {
        toast.success(`Batch completed — ${c.emailed} certificate(s) emailed`);
      } else if (c.emailed > 0 && c.failed > 0) {
        toast.success(`Batch completed — ${c.emailed} emailed, ${c.failed} failed`);
      } else if (c.failed > 0) {
        toast.error(`Batch locked but all ${c.failed} certificate emails failed`);
      } else {
        toast.success("Batch marked complete and locked");
      }
      setCompleteOpen(false);
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    setEditForm({
      name: batch.name ?? "",
      start_date: batch.start_date ?? "",
      end_date: batch.end_date ?? "",
      capacity: batch.capacity != null ? String(batch.capacity) : "",
      // "completed" is reached only through the Complete-batch flow, so it's not offered here.
      status: batch.status === "completed" ? "active" : batch.status,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!id) return;
    if (!editForm.name.trim()) { toast.error("Batch name is required"); return; }
    if (editForm.end_date && editForm.start_date && editForm.end_date < editForm.start_date) {
      toast.error("End date must be on or after the start date");
      return;
    }
    setSavingEdit(true);
    try {
      // end_date is admin-editable: it pre-fills from the course duration but can be
      // overridden here. The backend re-derives it only when it isn't supplied.
      await updateBatch(id, {
        name: editForm.name.trim(),
        start_date: editForm.start_date,
        end_date: editForm.end_date || undefined,
        capacity: editForm.capacity.trim() === "" ? null : Number(editForm.capacity),
        status: editForm.status,
      });
      toast.success("Batch updated");
      setEditOpen(false);
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteBatch(id);
      toast.success("Batch deleted");
      navigate("/admin/batches");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!batch) return <p className="text-body-sm text-ink-outline">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <button onClick={() => navigate("/admin/batches")} className="text-body-sm text-ink-outline hover:text-ink mb-1 inline-flex items-center gap-1">
            <span className="icon text-[16px]">arrow_back</span> Batches
          </button>
          <h1 className="font-display font-bold text-display-md text-ink">{batch.name}</h1>
          <p className="text-body-sm text-ink-variant">{batch.course_title} • {batch.delivery_mode}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={batch.is_locked ? "neutral" : batch.status === "active" ? "success" : "primary"}>
            {batch.status}{batch.is_locked ? " • locked" : ""}
          </Badge>
          {!batch.is_locked && (
            <>
              <Button variant="outline" leftIcon="edit" onClick={openEdit}>
                Edit
              </Button>
              <Button variant="outline" leftIcon="lock" onClick={() => setCompleteOpen(true)}>
                Complete batch
              </Button>
              <Button variant="ghost" leftIcon="delete" className="text-danger" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-ink-outlineVariant/40">
        {[
          { id: "overview", label: "Overview" },
          { id: "plan", label: "Plan" },
          { id: "enrollments", label: `Enrollments (${enrollments.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 h-10 text-body-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-ink-variant hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><p className="text-title-md font-semibold">Batch info</p></CardHeader>
            <CardBody className="space-y-2 text-body-sm">
              <Row label="Course" value={batch.course_title} />
              <Row label="Delivery mode" value={batch.delivery_mode} />
              <Row label="Start date" value={formatDate(batch.start_date)} />
              <Row label="End date" value={formatDate(batch.end_date)} />
              <Row label="Capacity" value={batch.capacity ?? "Unlimited"} />
              <Row label="Enrolled" value={batch.enrolled_count} />
              <div className="flex justify-between py-1 border-b border-ink-outlineVariant/30 last:border-0 items-center">
                <span className="text-ink-variant">Instructor</span>
                <span className="flex items-center gap-2">
                  <span className="text-ink font-medium">{batch.instructor_name || "Unassigned"}</span>
                  {!batch.is_locked && (
                    <Button size="sm" variant="outline" leftIcon="edit" onClick={openAssignInstructor}>
                      {batch.instructor_id ? "Change" : "Assign"}
                    </Button>
                  )}
                </span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><p className="text-title-md font-semibold">Quick stats</p></CardHeader>
            <CardBody className="space-y-3">
              <Stat label="Plans" value={plans.length} icon="calendar_view_week" />
              <Stat label="Active enrollments" value={enrollments.filter((e) => e.status === "active").length} icon="how_to_reg" />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "plan" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <p className="text-title-md font-semibold">Week / Day Plan</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={savePlans}>Save plans</Button>
              <Button size="sm" leftIcon="sync" onClick={onSync}>Sync sessions</Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {plans.length === 0 && <p className="text-body-sm text-ink-outline">No plans yet</p>}
            {plans.map((p, i) => (
              <div key={p.id} className="grid md:grid-cols-[80px_1fr] gap-3 bg-surface-containerLow p-3 rounded-xl">
                <div className="text-label uppercase text-ink-outline pt-2">#{p.plan_index}</div>
                <div className="space-y-2">
                  <Input value={p.title} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Title" />
                  <Textarea value={p.summary || ""} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, summary: e.target.value } : x))} placeholder="Summary" rows={2} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {tab === "enrollments" && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <p className="text-title-md font-semibold">Enrolled students</p>
            <Button size="sm" leftIcon="person_add" onClick={() => setEnrollOpen(true)} disabled={batch.is_locked}>Enroll student</Button>
          </CardHeader>
          <CardBody className="p-0">
            {enrollments.length === 0 ? (
              <p className="p-5 text-body-sm text-ink-outline">No enrollments yet</p>
            ) : (
              <Table>
                <THead>
                  <tr><TH>Name</TH><TH>Email</TH><TH>Enrolled</TH><TH>Status</TH><TH /></tr>
                </THead>
                <tbody>
                  {enrollments.map((e) => (
                    <TR key={e.id}>
                      <TD className="font-medium">{e.student_name}</TD>
                      <TD className="text-ink-variant">{e.student_email}</TD>
                      <TD>{formatDateTime(e.enrolled_at)}</TD>
                      <TD><Badge tone={e.status === "active" ? "success" : "neutral"}>{e.status}</Badge></TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" leftIcon="delete" className="text-danger"
                          onClick={async () => {
                            if (!id) return;
                            try {
                              await batchRemoveEnrollment(id, e.id);
                              toast.success("Enrollment removed");
                              refresh();
                            } catch (err) {
                              toast.error(extractErrorMessage(err));
                            }
                          }}
                        />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Enroll student"
        description="Pick a student to add to this batch"
        footer={<>
          <Button variant="ghost" onClick={() => setEnrollOpen(false)} disabled={enrolling}>Cancel</Button>
          <Button onClick={enroll} loading={enrolling} disabled={!enrollStudentId}>Enroll</Button>
        </>}
      >
        <SearchableSelect
          label="Student"
          placeholder="Select a student"
          loading={studentsLoading}
          options={allStudents
            .filter((s) => !enrollments.some((e) => e.student_id === s.user_id))
            .map((s) => ({ value: s.user_id, label: s.display_name, sublabel: s.email }))}
          value={enrollStudentId}
          onChange={setEnrollStudentId}
          emptyText="No students available"
        />
      </Modal>

      <ConfirmModal
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={onComplete}
        title="Mark batch complete and issue certificates?"
        description="The batch will be locked, and a certificate PDF will be rendered and emailed to every enrolled student. Make sure the certificate template is uploaded first."
        confirmLabel="Complete & email certificates"
        loading={busy}
      />

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit batch"
        description="Update the batch details. Completed batches are locked and can't be edited."
        size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={savingEdit}>Cancel</Button>
          <Button onClick={saveEdit} loading={savingEdit}>Save changes</Button>
        </>}
      >
        <div className="space-y-3">
          <Input
            label="Batch name"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            leftIcon="groups_2"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start date"
              type="date"
              value={editForm.start_date}
              onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))}
            />
            <Input
              label="End date"
              type="date"
              value={editForm.end_date}
              onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))}
              hint="Auto-filled from the course duration — you can override it."
            />
          </div>
          <Input
            label="Capacity"
            type="number"
            min={0}
            value={editForm.capacity}
            onChange={(e) => setEditForm((f) => ({ ...f, capacity: e.target.value }))}
            hint="Leave blank for unlimited"
          />
          <Select
            label="Status"
            value={editForm.status}
            onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
            options={[
              { value: "upcoming", label: "Upcoming" },
              { value: "active", label: "Active" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            hint="Use “Complete batch” to mark a batch completed and issue certificates."
          />
        </div>
      </Modal>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        title={`Delete "${batch.name}"?`}
        description={
          enrollments.length > 0
            ? `This permanently deletes the batch and removes all ${enrollments.length} enrollment(s), its schedule and session plan. Students keep their accounts. This cannot be undone.`
            : "This permanently deletes the batch, its schedule and session plan. This cannot be undone."
        }
        confirmLabel="Delete batch"
        destructive
        loading={deleting}
      />

      <Modal
        open={assignInstructorOpen}
        onClose={() => setAssignInstructorOpen(false)}
        title="Assign instructor to this batch"
        description="Pick any instructor to assign directly to this batch."
        size="md"
      >
        <div className="space-y-2">
          <Input
            placeholder="Search instructors by name or email"
            value={instructorSearch}
            onChange={(e) => setInstructorSearch(e.target.value)}
            leftIcon="search"
            autoFocus
          />
          {batch.instructor_id && (
            <button
              onClick={() => assignInstructor(null)}
              disabled={assigning}
              className="w-full flex items-center justify-between p-3 rounded-md bg-danger-container/30 hover:bg-danger-container/50 text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <span className="icon text-danger">person_remove</span>
                <span className="text-body-sm font-medium text-danger">Unassign current instructor</span>
              </div>
            </button>
          )}
          <div className="max-h-72 overflow-y-auto scrollbar-thin space-y-2">
            {instructorOptions.length === 0 ? (
              <div className="p-4 bg-surface-containerLow rounded-md text-body-sm text-ink-variant">
                No instructors found. Create one in Instructors first.
              </div>
            ) : (
              instructorOptions
                .filter((i) => {
                  if (!instructorSearch) return true;
                  const q = instructorSearch.toLowerCase();
                  return (
                    i.display_name?.toLowerCase().includes(q) ||
                    i.email?.toLowerCase().includes(q)
                  );
                })
                .map((i) => {
                  const isCurrent = batch.instructor_id === i.user_id;
                  return (
                    <button
                      key={i.user_id}
                      onClick={() => !isCurrent && assignInstructor(i.user_id)}
                      disabled={assigning || isCurrent}
                      className={`w-full flex items-center justify-between p-3 rounded-md text-left ${
                        isCurrent
                          ? "bg-primary-container/30 cursor-default"
                          : "bg-surface-containerLow hover:bg-surface-container"
                      }`}
                    >
                      <div>
                        <p className="text-body-sm font-medium text-ink">{i.display_name}</p>
                        <p className="text-label text-ink-outline">{i.email}</p>
                      </div>
                      {isCurrent ? (
                        <Badge tone="success">Current</Badge>
                      ) : (
                        <span className="icon text-primary">add</span>
                      )}
                    </button>
                  );
                })
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between py-1 border-b border-ink-outlineVariant/30 last:border-0">
      <span className="text-ink-variant">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: any; icon: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-surface-containerLow rounded-xl">
      <div className="w-10 h-10 rounded-lg bg-primary-container/30 grid place-items-center text-primary-onContainer">
        <span className="icon">{icon}</span>
      </div>
      <div>
        <p className="text-body-sm text-ink-variant">{label}</p>
        <p className="font-display font-bold text-title-md text-ink">{value}</p>
      </div>
    </div>
  );
}
