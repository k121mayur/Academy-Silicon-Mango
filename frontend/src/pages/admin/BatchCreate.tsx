import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { extractErrorMessage } from "@/lib/api";
import { createBatch, listCourseInstructors, listCourses } from "@/services/admin.service";

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

  useEffect(() => {
    listCourses({ limit: 100 }).then((r) => setCourses(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!courseId) {
      setCourse(null);
      setInstructors([]);
      return;
    }
    const c = courses.find((x) => x.id === courseId);
    setCourse(c);
    if (!name) setName(`${c?.title} — Batch ${new Date().getFullYear()}`);
    listCourseInstructors(courseId)
      .then((rows) => setInstructors(rows))
      .catch(() => setInstructors([]));
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseId || !startDate || !endDate) {
      toast.error("Course, start and end date are required");
      return;
    }
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
            onChange={(e) => setCourseId(e.target.value)}
            options={[{ value: "", label: "Select a course" }, ...courses.map((c) => ({ value: c.id, label: c.title }))]}
            containerClassName="md:col-span-2"
            required
          />
          <Input label="Batch Name" value={name} onChange={(e) => setName(e.target.value)} required containerClassName="md:col-span-2" />
          <Select
            label="Delivery Mode"
            value={deliveryMode}
            onChange={(e) => setDeliveryMode(e.target.value)}
            options={[{ value: "live", label: "Live" }, { value: "recorded", label: "Recorded" }]}
          />
          <Input label="Capacity (optional)" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
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
                <Input label="Start time" type="time" value={s.start_time} onChange={(e) => updateSlot(i, { start_time: e.target.value })} />
                <Input label="End time" type="time" value={s.end_time} onChange={(e) => updateSlot(i, { end_time: e.target.value })} />
                <Button type="button" variant="ghost" leftIcon="delete" className="text-danger" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Step 3 — Instructor</p></CardHeader>
        <CardBody>
          {!courseId ? (
            <p className="text-body-sm text-ink-outline">Select a course first</p>
          ) : instructors.length === 0 ? (
            <p className="text-body-sm text-danger">No instructors assigned to this course. Assign one from the Assign Instructors page first.</p>
          ) : (
            <Select
              label="Instructor"
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              options={[{ value: "", label: "Unassigned" }, ...instructors.map((i) => ({ value: i.user_id, label: i.display_name }))]}
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
