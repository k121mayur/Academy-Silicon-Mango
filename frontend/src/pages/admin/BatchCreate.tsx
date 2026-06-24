import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { extractErrorMessage } from "@/lib/api";
import { createBatch, listCourses, listInstructors } from "@/services/admin.service";
import { WEEKDAY_LABELS } from "@/lib/utils";

interface Slot {
  slot_type: "weekday" | "date_based";
  weekday?: number;
  slot_date?: string;
  start_time: string;
  end_time: string;
}

export default function BatchCreate() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState("");
  const [course, setCourse] = useState<any>(null);
  const [name, setName] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("live");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [instructors, setInstructors] = useState<any[]>([]);
  const [instructorId, setInstructorId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (field: string) => setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  // Today's local date as YYYY-MM-DD — the earliest a new batch may start.
  const today = (() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  })();

  const isWeekBased = course?.duration_unit === "weeks";

  useEffect(() => {
    listCourses({ limit: 100 }).then((r) => setCourses(r.data)).catch(() => {});
    listInstructors({ limit: 100 }).then((r) => setInstructors(r.data)).catch(() => setInstructors([]));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setCourse(null);
      return;
    }
    const c = courses.find((x) => x.id === courseId);
    setCourse(c);
    if (!name) setName(`${c?.title} — Batch ${new Date().getFullYear()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, courses]);

  // End date is derived from the course duration (inclusive of the start day),
  // mirroring the backend: a 4-week batch from Jun 1 ends Jun 28; a 15-day
  // batch from Jul 1 ends Jul 15.
  const computeEndDate = (start: string, c: any): string => {
    if (!start || !c) return "";
    const total = c.duration_unit === "weeks" ? Number(c.duration_value) * 7 : Number(c.duration_value);
    const days = Math.max(total || 1, 1);
    const d = new Date(`${start}T00:00:00`);
    d.setDate(d.getDate() + days - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  // Keep the end date in sync whenever the start date or selected course changes.
  useEffect(() => {
    if (startDate && course) {
      setEndDate(computeEndDate(startDate, course));
      clearErr("endDate");
    } else {
      setEndDate("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, course]);

  const addSlot = () => {
    if (!course) return;
    if (course.duration_unit === "weeks") {
      // A week has only 7 days — never add more than 7 weekday slots, and
      // auto-advance to the next unused weekday (Mon, Tue, Wed, …).
      const used = new Set(slots.map((s) => s.weekday));
      const next = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d));
      if (next === undefined) {
        toast.error("All 7 weekdays are already scheduled");
        return;
      }
      setSlots([...slots, { slot_type: "weekday", weekday: next, start_time: "10:00", end_time: "11:30" }]);
    } else {
      setSlots([...slots, { slot_type: "date_based", slot_date: startDate, start_time: "10:00", end_time: "11:30" }]);
    }
  };

  const updateSlot = (i: number, patch: Partial<Slot>) => {
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!courseId) e.courseId = "Please select a course";
    if (!name.trim()) e.name = "Batch name is required";
    if (!deliveryMode) e.deliveryMode = "Delivery mode is required";
    if (!capacity) {
      e.capacity = "Capacity is required";
    } else {
      const capNum = parseInt(capacity);
      if (isNaN(capNum) || capNum < 1) e.capacity = "Capacity must be a positive number";
    }
    if (!startDate) e.startDate = "Start date is required";
    else if (startDate < today) e.startDate = "Start date cannot be in the past";
    if (!endDate) e.endDate = "End date is required";
    if (startDate && endDate && endDate < startDate) e.endDate = "End date must be after start date";
    if (!instructorId) e.instructorId = "Instructor is required";
    if (deliveryMode === "live") {
      slots.forEach((s, i) => {
        if (s.start_time >= s.end_time) e[`slot_${i}`] = `Slot ${i + 1}: end time must be after start time`;
      });
      if (isWeekBased) {
        const seen = new Set<number>();
        slots.forEach((s, i) => {
          const wd = s.weekday ?? 0;
          if (seen.has(wd)) e[`slotwd_${i}`] = `${WEEKDAY_LABELS[wd]} is already scheduled`;
          seen.add(wd);
        });
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = Object.values(e)[0];
      toast.error(first);
    }
    return Object.keys(e).length === 0;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: any = {
        course_id: courseId,
        name,
        delivery_mode: deliveryMode,
        start_date: startDate,
        end_date: endDate,
        capacity: capacity ? parseInt(capacity) : null,
        instructor_id: instructorId || null,
        schedule_slots: deliveryMode === "live" ? slots : [],
      };
      const created = await createBatch(payload);
      toast.success("Batch created with sessions auto-generated");
      navigate(`/admin/batches/${created.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Create Batch</h1>
        <p className="text-body-sm text-ink-variant">Set up a new cohort and let us auto-generate sessions</p>
      </div>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Step 1 — Basics</p></CardHeader>
        <CardBody className="grid md:grid-cols-2 gap-4">
          <Select
            label="Course"
            value={courseId}
            onChange={(e) => { setCourseId(e.target.value); clearErr("courseId"); }}
            options={[{ value: "", label: "Select a course" }, ...courses.map((c) => ({ value: c.id, label: c.title }))]}
            containerClassName="md:col-span-2"
            error={errors.courseId}
          />
          <Input label="Batch Name" value={name} onChange={(e) => { setName(e.target.value); clearErr("name"); }} containerClassName="md:col-span-2" error={errors.name} />
          <Select
            label="Delivery Mode"
            value={deliveryMode}
            onChange={(e) => { setDeliveryMode(e.target.value); clearErr("deliveryMode"); }}
            options={[{ value: "live", label: "Live" }, { value: "recorded", label: "Recorded" }]}
            error={errors.deliveryMode}
          />
          <Input label="Capacity" type="number" min={1} value={capacity} onChange={(e) => { setCapacity(e.target.value); clearErr("capacity"); }} error={errors.capacity} />
          <Input label="Start date" type="date" min={today} value={startDate} onChange={(e) => { setStartDate(e.target.value); clearErr("startDate"); }} error={errors.startDate} />
          <div>
            <Input
              label="End date (auto-calculated)"
              type="date"
              value={endDate}
              readOnly
              disabled
              error={errors.endDate}
            />
            <p className="text-label text-ink-outline mt-1">
              {course
                ? `Auto-set from the course's ${course.duration_value} ${course.duration_unit} duration.`
                : "Select a course and start date — the end date is calculated automatically."}
            </p>
          </div>
        </CardBody>
      </Card>

      {deliveryMode === "live" && course && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <p className="text-title-md font-semibold">Step 2 — Schedule</p>
              <p className="text-label text-ink-outline">
                {course.duration_unit === "weeks" ? "Pick weekdays + time slots" : "Pick session dates + times"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon="add"
              onClick={addSlot}
              disabled={isWeekBased && slots.length >= 7}
            >
              Add slot
            </Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {slots.length === 0 && <p className="text-body-sm text-ink-outline">No slots yet</p>}
            {slots.map((s, i) => (
              <div key={i} className="grid md:grid-cols-4 gap-2 items-end bg-surface-containerLow p-3 rounded-xl">
                {course.duration_unit === "weeks" ? (
                  <Select
                    label="Weekday"
                    value={String(s.weekday ?? 0)}
                    onChange={(e) => { updateSlot(i, { weekday: parseInt(e.target.value) }); clearErr(`slotwd_${i}`); }}
                    options={WEEKDAY_LABELS.map((w, idx) => ({ value: String(idx), label: w }))}
                    error={errors[`slotwd_${i}`]}
                  />
                ) : (
                  <Input label="Date" type="date" value={s.slot_date || ""} onChange={(e) => updateSlot(i, { slot_date: e.target.value })} />
                )}
                <Input label="Start time" type="time" value={s.start_time} onChange={(e) => { updateSlot(i, { start_time: e.target.value }); clearErr(`slot_${i}`); }} />
                <Input label="End time" type="time" value={s.end_time} onChange={(e) => { updateSlot(i, { end_time: e.target.value }); clearErr(`slot_${i}`); }} error={errors[`slot_${i}`]} />
                <Button type="button" variant="ghost" leftIcon="delete" className="text-danger" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Step 3 — Instructor</p></CardHeader>
        <CardBody>
          {instructors.length === 0 ? (
            <p className="text-body-sm text-danger">No instructors exist yet. Create one from the Instructors page first.</p>
          ) : (
            <Select
              label="Instructor"
              value={instructorId}
              onChange={(e) => { setInstructorId(e.target.value); clearErr("instructorId"); }}
              options={[{ value: "", label: "Select an instructor" }, ...instructors.map((i) => ({ value: i.user_id, label: `${i.display_name} (${i.email})` }))]}
              error={errors.instructorId}
            />
          )}
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => navigate("/admin/batches")}>Cancel</Button>
        <Button type="submit" loading={submitting}>Create Batch</Button>
      </div>
    </form>
  );
}
