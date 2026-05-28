import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { extractErrorMessage } from "@/lib/api";
import { createBatch, listCourses, listInstructors } from "@/services/admin.service";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const addSlot = () => {
    if (!course) return;
    if (course.duration_unit === "weeks") {
      setSlots([...slots, { slot_type: "weekday", weekday: 0, start_time: "10:00", end_time: "11:30" }]);
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
    if (!startDate) e.startDate = "Start date is required";
    if (!endDate) e.endDate = "End date is required";
    if (startDate && endDate && endDate < startDate) e.endDate = "End date must be after start date";
    if (deliveryMode === "live") {
      slots.forEach((s, i) => {
        if (s.start_time >= s.end_time) e[`slot_${i}`] = `Slot ${i + 1}: end time must be after start time`;
      });
    }
    setErrors(e);
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
            onChange={(e) => setDeliveryMode(e.target.value)}
            options={[{ value: "live", label: "Live" }, { value: "recorded", label: "Recorded" }]}
          />
          <Input label="Capacity (optional)" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <Input label="Start date" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); clearErr("startDate"); }} error={errors.startDate} />
          <Input label="End date" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); clearErr("endDate"); }} error={errors.endDate} />
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
            <Button type="button" size="sm" variant="outline" leftIcon="add" onClick={addSlot}>Add slot</Button>
          </CardHeader>
          <CardBody className="space-y-3">
            {slots.length === 0 && <p className="text-body-sm text-ink-outline">No slots yet</p>}
            {slots.map((s, i) => (
              <div key={i} className="grid md:grid-cols-4 gap-2 items-end bg-surface-containerLow p-3 rounded-xl">
                {course.duration_unit === "weeks" ? (
                  <Select
                    label="Weekday"
                    value={String(s.weekday ?? 0)}
                    onChange={(e) => updateSlot(i, { weekday: parseInt(e.target.value) })}
                    options={WEEKDAYS.map((w, idx) => ({ value: String(idx), label: w }))}
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
              label="Instructor (optional — can be assigned later)"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              options={[{ value: "", label: "Unassigned" }, ...instructors.map((i) => ({ value: i.user_id, label: `${i.display_name} (${i.email})` }))]}
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
