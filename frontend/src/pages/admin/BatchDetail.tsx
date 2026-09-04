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
  toggleBatchEnrollment,
  deleteBatch,
  listAllStudents,
  listInstructors,
  batchAssignInstructor,
  StudentDTO,
} from "@/services/admin.service";
import { formatDate, formatDateTime, WEEKDAY_LABELS } from "@/lib/utils";

interface Slot {
  slot_type: "weekday" | "date_based";
  weekday?: number | null;
  slot_date?: string | null;
  start_time: string;
  end_time: string;
}

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
  const [enrollFeePaid, setEnrollFeePaid] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    start_date: "",
    end_date: "",
    capacity: "",
    status: "upcoming",
    is_enrollment_closed: false,
    schedule_mode: "date_based" as "date_based" | "weekday",
    slots: [] as Slot[],
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingEnrollment, setTogglingEnrollment] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [assignInstructorOpen, setAssignInstructorOpen] = useState(false);
  const [instructorOptions, setInstructorOptions] = useState<any[]>([]);
  const [instructorSearch, setInstructorSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  const onToggleEnrollment = async () => {
    if (!id || !batch) return;
    const nextState = !batch.is_enrollment_closed;
    setTogglingEnrollment(true);
    try {
      await toggleBatchEnrollment(id, nextState);
      toast.success(nextState ? "Enrollments stopped for this batch" : "Enrollments reopened for this batch");
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setTogglingEnrollment(false);
    }
  };

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
      toast.success(`Synced — ${res.sessions_created} session(s) created`);
      refresh();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  useEffect(() => {
    if (!enrollOpen) {
      setEnrollStudentId(null);
      setEnrollFeePaid(true);
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
      await batchEnroll(id, enrollStudentId, enrollFeePaid);
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

  const addDaysISO = (start: string, n: number): string => {
    const d = new Date(`${start}T00:00:00`);
    d.setDate(d.getDate() + n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const openEdit = () => {
    const isDayCourse = batch?.course_duration_unit === "days";
    const hasDateSlots = (batch?.schedule_slots || []).some((s: any) => s.slot_type === "date_based");
    const scheduleMode: "date_based" | "weekday" = isDayCourse || hasDateSlots ? "date_based" : "weekday";

    const rawSlots = (batch?.schedule_slots || []).map((s: any) => ({
      slot_type: (s.slot_type as "weekday" | "date_based") || scheduleMode,
      weekday: s.weekday,
      slot_date: s.slot_date || "",
      start_time: s.start_time || "20:00",
      end_time: s.end_time || "21:30",
    }));

    setEditForm({
      name: batch?.name ?? "",
      start_date: batch?.start_date ?? "",
      end_date: batch?.end_date ?? "",
      capacity: batch?.capacity != null ? String(batch.capacity) : "",
      // "completed" is reached only through the Complete-batch flow, so it's not offered here.
      status: batch?.status === "completed" ? "active" : batch?.status ?? "upcoming",
      is_enrollment_closed: !!batch?.is_enrollment_closed,
      schedule_mode: scheduleMode,
      slots: rawSlots,
    });
    setEditOpen(true);
  };

  const updateSlot = (idx: number, patch: Partial<Slot>) => {
    setEditForm((f) => ({
      ...f,
      slots: f.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const autoAlignDates = (mode: "weekdays_only" | "consecutive" = "weekdays_only") => {
    if (!editForm.start_date) {
      toast.error("Please set a batch start date first");
      return;
    }
    const currentSlots = editForm.slots;
    const count = currentSlots.length || (batch?.course_duration_value ? Number(batch.course_duration_value) : 8);
    const fallbackStart = currentSlots[0]?.start_time || "20:00";
    const fallbackEnd = currentSlots[0]?.end_time || "21:30";

    const newSlots: Slot[] = [];
    let cur = new Date(`${editForm.start_date}T00:00:00`);

    for (let i = 0; i < count; i++) {
      if (mode === "weekdays_only") {
        while (cur.getDay() === 0 || cur.getDay() === 6) {
          cur.setDate(cur.getDate() + 1);
        }
      }
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, "0");
      const dd = String(cur.getDate()).padStart(2, "0");
      const dStr = `${yyyy}-${mm}-${dd}`;
      const existing = currentSlots[i];
      newSlots.push({
        slot_type: "date_based",
        weekday: null,
        slot_date: dStr,
        start_time: existing?.start_time || fallbackStart,
        end_time: existing?.end_time || fallbackEnd,
      });
      cur.setDate(cur.getDate() + 1);
    }

    const lastDate = newSlots[newSlots.length - 1]?.slot_date;
    setEditForm((f) => ({
      ...f,
      slots: newSlots,
      end_date: lastDate || f.end_date,
    }));
    toast.success(`Schedule aligned for ${newSlots.length} sessions`);
  };

  const addSlot = () => {
    if (editForm.schedule_mode === "weekday") {
      const used = new Set(editForm.slots.map((s: Slot) => s.weekday));
      const next = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d));
      if (next === undefined) {
        toast.error("All 7 weekdays are already scheduled");
        return;
      }
      setEditForm((f) => ({
        ...f,
        slots: [
          ...f.slots,
          {
            slot_type: "weekday",
            weekday: next,
            start_time: f.slots[f.slots.length - 1]?.start_time || "20:00",
            end_time: f.slots[f.slots.length - 1]?.end_time || "21:30",
          },
        ],
      }));
    } else {
      const existingDates = editForm.slots.map((s) => s.slot_date).filter(Boolean) as string[];
      let nextDate = editForm.start_date || "";
      if (existingDates.length > 0) {
        const latest = existingDates.reduce((a, b) => (a > b ? a : b));
        nextDate = addDaysISO(latest, 1);
      }
      setEditForm((f) => ({
        ...f,
        slots: [
          ...f.slots,
          {
            slot_type: "date_based",
            weekday: null,
            slot_date: nextDate,
            start_time: f.slots[f.slots.length - 1]?.start_time || "20:00",
            end_time: f.slots[f.slots.length - 1]?.end_time || "21:30",
          },
        ],
      }));
    }
  };

  const saveEdit = async () => {
    if (!id) return;
    if (!editForm.name.trim()) { toast.error("Batch name is required"); return; }
    if (editForm.end_date && editForm.start_date && editForm.end_date < editForm.start_date) {
      toast.error("End date must be on or after the start date");
      return;
    }

    // Validate slots
    for (let i = 0; i < editForm.slots.length; i++) {
      const s = editForm.slots[i];
      if (editForm.schedule_mode === "date_based") {
        if (!s.slot_date) {
          toast.error(`Please select a date for Session #${i + 1}`);
          return;
        }
      } else {
        if (s.weekday == null || s.weekday < 0 || s.weekday > 6) {
          toast.error(`Please select a day of week for Slot #${i + 1}`);
          return;
        }
      }
      if (!s.start_time || !s.end_time) {
        toast.error(`Please enter start and end time for Slot #${i + 1}`);
        return;
      }
      if (s.start_time >= s.end_time) {
        toast.error(`End time must be after start time for Slot #${i + 1}`);
        return;
      }
    }

    setSavingEdit(true);
    try {
      const cleanedSlots = editForm.slots.map((s) => ({
        slot_type: editForm.schedule_mode,
        weekday: editForm.schedule_mode === "weekday" ? (s.weekday != null ? Number(s.weekday) : 0) : null,
        slot_date: editForm.schedule_mode === "date_based" ? s.slot_date : null,
        start_time: s.start_time,
        end_time: s.end_time,
      }));

      await updateBatch(id, {
        name: editForm.name.trim(),
        start_date: editForm.start_date,
        end_date: editForm.end_date || undefined,
        capacity: editForm.capacity.trim() === "" ? null : Number(editForm.capacity),
        status: editForm.status,
        is_enrollment_closed: editForm.is_enrollment_closed,
        schedule_slots: cleanedSlots,
      });
      toast.success("Batch and schedule updated");
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
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={batch.is_locked ? "neutral" : batch.status === "active" ? "success" : "primary"}>
            {batch.status}{batch.is_locked ? " • locked" : ""}
          </Badge>
          {batch.is_enrollment_closed ? (
            <Badge tone="danger" icon="pause_circle">Enrollments stopped</Badge>
          ) : (
            <Badge tone="success" icon="check_circle">Enrollments open</Badge>
          )}
          {!batch.is_locked && (
            <>
              <Button
                variant="outline"
                leftIcon={batch.is_enrollment_closed ? "play_circle" : "pause_circle"}
                className={batch.is_enrollment_closed ? "text-primary" : "text-amber-700 hover:bg-amber-50 dark:text-amber-400"}
                disabled={togglingEnrollment}
                onClick={onToggleEnrollment}
              >
                {batch.is_enrollment_closed ? "Resume enrollments" : "Stop enrollments"}
              </Button>
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
              <Row
                label="Enrollment status"
                value={
                  batch.is_locked ? (
                    <Badge tone="neutral">Locked</Badge>
                  ) : batch.is_enrollment_closed ? (
                    <Badge tone="danger">Stopped by admin</Badge>
                  ) : batch.capacity && batch.enrolled_count >= batch.capacity ? (
                    <Badge tone="warning">Full (Closed)</Badge>
                  ) : new Date(batch.start_date + "T23:59:59") < new Date() ? (
                    <Badge tone="neutral">Course started (Closed)</Badge>
                  ) : (
                    <Badge tone="success">Open</Badge>
                  )
                }
              />
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

          <Card className="md:col-span-2">
            <CardHeader className="flex items-center justify-between">
              <div>
                <p className="text-title-md font-semibold">Schedule & Class Timings</p>
                <p className="text-label text-ink-outline">
                  {batch.delivery_mode === "live"
                    ? batch.schedule_slots && batch.schedule_slots.some((s: any) => s.slot_type === "date_based")
                      ? "Cohort session dates and timings visible to students"
                      : "Weekly recurring days and timings visible to students"
                    : "Recorded batch — content available on-demand"}
                </p>
              </div>
              {!batch.is_locked && batch.delivery_mode === "live" && (
                <Button size="sm" variant="outline" leftIcon="edit" onClick={openEdit}>
                  Edit Schedule
                </Button>
              )}
            </CardHeader>
            <CardBody>
              {batch.delivery_mode === "recorded" ? (
                <p className="text-body-sm text-ink-variant">
                  This is a recorded / self-paced batch. Lessons and sessions are available on-demand.
                </p>
              ) : !batch.schedule_slots || batch.schedule_slots.length === 0 ? (
                <div className="p-4 bg-surface-containerLow rounded-xl text-center">
                  <p className="text-body-sm text-ink-outline">No schedule slots configured yet.</p>
                  {!batch.is_locked && (
                    <Button size="sm" variant="outline" leftIcon="add" className="mt-2" onClick={openEdit}>
                      Configure schedule slots
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {batch.schedule_slots.map((s: any, i: number) => (
                    <div key={i} className="p-3 bg-surface-containerLow rounded-xl border border-ink-outlineVariant/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-label uppercase font-bold text-ink-outline tracking-wider">
                          {s.slot_type === "date_based" ? `Day ${i + 1}` : `Slot ${i + 1}`}
                        </span>
                        <span className="icon text-[16px] text-primary">schedule</span>
                      </div>
                      <p className="text-body-sm font-semibold text-ink">
                        {s.slot_type === "date_based" && s.slot_date
                          ? formatDate(s.slot_date)
                          : s.weekday != null && s.weekday >= 0 && s.weekday < 7
                          ? `Every ${WEEKDAY_LABELS[s.weekday]}`
                          : "Scheduled"}
                      </p>
                      <p className="text-label text-ink-variant">
                        {s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : "Time not set"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
        <div className="space-y-4">
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
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input
              type="checkbox"
              checked={enrollFeePaid}
              onChange={(e) => setEnrollFeePaid(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Fees paid
          </label>
        </div>
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
        size="lg"
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

          <div className="p-3.5 bg-surface-containerLow rounded-xl border border-ink-outlineVariant/30">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.is_enrollment_closed}
                onChange={(e) => setEditForm((f) => ({ ...f, is_enrollment_closed: e.target.checked }))}
                className="mt-0.5 w-4 h-4 text-primary rounded border-ink-outlineVariant/50 focus:ring-primary"
              />
              <div>
                <p className="text-body-sm font-semibold text-ink">Stop enrollments for this batch</p>
                <p className="text-label text-ink-outline">
                  When checked, this batch will be hidden from the public course page and student self-enrollments will be blocked.
                </p>
              </div>
            </label>
          </div>

          {batch.delivery_mode === "live" && (
            <div className="border-t border-ink-outlineVariant/40 pt-4 mt-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-label font-medium text-ink-variant uppercase tracking-wide">Schedule Slots</p>
                  <p className="text-label text-ink-outline">
                    {editForm.schedule_mode === "date_based"
                      ? "Cohort session dates and timings visible to students"
                      : "Weekly recurring days and timings visible to students"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center rounded-lg border border-ink-outlineVariant/40 p-0.5 bg-surface-containerLow text-label">
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm((f) => ({
                          ...f,
                          schedule_mode: "date_based",
                          slots: f.slots.map((s, i) => ({
                            ...s,
                            slot_type: "date_based",
                            slot_date: s.slot_date || (f.start_date ? addDaysISO(f.start_date, i) : ""),
                            weekday: null,
                          })),
                        }));
                      }}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        editForm.schedule_mode === "date_based"
                          ? "bg-primary text-white font-semibold shadow-xs"
                          : "text-ink-variant hover:text-ink"
                      }`}
                    >
                      Date-based
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm((f) => ({
                          ...f,
                          schedule_mode: "weekday",
                          slots: f.slots.map((s, i) => ({
                            ...s,
                            slot_type: "weekday",
                            weekday: s.weekday ?? (i % 7),
                          })),
                        }));
                      }}
                      className={`px-2.5 py-1 rounded-md transition-colors ${
                        editForm.schedule_mode === "weekday"
                          ? "bg-primary text-white font-semibold shadow-xs"
                          : "text-ink-variant hover:text-ink"
                      }`}
                    >
                      Weekly
                    </button>
                  </div>

                  {editForm.schedule_mode === "date_based" && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        leftIcon="auto_fix_high"
                        title="Auto-fill session dates Mon–Fri starting from start date"
                        onClick={() => autoAlignDates("weekdays_only")}
                      >
                        Auto-align (Mon–Fri)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        leftIcon="calendar_today"
                        title="Auto-fill consecutive days starting from start date"
                        onClick={() => autoAlignDates("consecutive")}
                      >
                        Consecutive
                      </Button>
                    </div>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon="add"
                    onClick={addSlot}
                    disabled={editForm.schedule_mode === "weekday" && editForm.slots.length >= 7}
                  >
                    Add slot
                  </Button>
                </div>
              </div>

              {editForm.slots.length === 0 && (
                <p className="text-body-sm text-ink-outline">No schedule slots. Click &ldquo;Add slot&rdquo; or &ldquo;Auto-align&rdquo; to set class timings.</p>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {editForm.slots.map((s: Slot, i: number) => (
                  <div key={i} className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center bg-surface-containerLow p-2.5 rounded-xl">
                    <span className="text-label font-bold text-ink-outline min-w-[55px]">
                      {editForm.schedule_mode === "date_based" ? `Day ${i + 1}` : `Slot ${i + 1}`}
                    </span>
                    {editForm.schedule_mode === "date_based" ? (
                      <Input
                        label="Date"
                        type="date"
                        value={s.slot_date || ""}
                        onChange={(e) => updateSlot(i, { slot_date: e.target.value })}
                      />
                    ) : (
                      <Select
                        label="Day"
                        value={String(s.weekday ?? 0)}
                        onChange={(e) => updateSlot(i, { weekday: parseInt(e.target.value) })}
                        options={WEEKDAY_LABELS.map((w, idx) => ({ value: String(idx), label: w }))}
                      />
                    )}
                    <Input
                      label="Start time"
                      type="time"
                      value={s.start_time}
                      onChange={(e) => updateSlot(i, { start_time: e.target.value })}
                    />
                    <Input
                      label="End time"
                      type="time"
                      value={s.end_time}
                      onChange={(e) => updateSlot(i, { end_time: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      leftIcon="delete"
                      className="text-danger mt-4"
                      onClick={() => setEditForm((f) => ({ ...f, slots: f.slots.filter((_: Slot, j: number) => j !== i) }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
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
