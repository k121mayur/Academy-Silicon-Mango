import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api";
import { fetchBatches, type InstructorBatch } from "@/services/instructor.service";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AssignedBatches() {
  const [batches, setBatches] = useState<InstructorBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { selectedBatchId, setSelectedBatchId } = useSelectedBatch();

  useEffect(() => {
    let cancelled = false;
    fetchBatches()
      .then((data) => !cancelled && setBatches(data))
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const pickAndGo = (id: string, dest: string) => {
    setSelectedBatchId(id);
    navigate(dest);
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Assigned Batches</h1>
        <p className="text-body-sm text-ink-variant">
          Pick a batch to make it your current context for sessions, attendance, grading, and completion.
        </p>
      </div>

      {loading && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">Loading batches…</p>
          </CardBody>
        </Card>
      )}

      {!loading && batches.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">
              No batches assigned yet. Ask an admin to assign you to a course and then a batch.
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {batches.map((b) => {
          const isSelected = b.id === selectedBatchId;
          return (
            <Card key={b.id} className={isSelected ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-title-md text-ink">{b.course_title}</p>
                    <p className="text-label text-ink-outline">{b.name}</p>
                  </div>
                  <Badge tone={b.status === "completed" ? "success" : b.status === "active" ? "primary" : "neutral"}>
                    {b.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-body-sm">
                  <Field label="Delivery" value={b.delivery_mode} />
                  <Field label="Range" value={`${b.start_date} → ${b.end_date}`} />
                  <Field label="Students" value={b.enrolled_count} />
                  <Field label="Sessions" value={b.sessions_count} />
                  <Field label="Assignments" value={b.assignments_count} />
                  <Field
                    label="Certificates"
                    value={
                      b.certificates_count > 0
                        ? `${b.certificates_count} issued`
                        : "None issued yet"
                    }
                  />
                </div>

                {b.schedule_slots.length > 0 && (
                  <div>
                    <p className="text-label uppercase tracking-wide text-ink-outline mb-1">Schedule</p>
                    <ul className="text-body-sm text-ink space-y-0.5">
                      {b.schedule_slots.map((s, i) => (
                        <li key={i}>
                          {s.slot_type === "weekday" && s.weekday !== null
                            ? WEEKDAYS[s.weekday]
                            : s.slot_date ?? "—"}{" "}
                          · {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={isSelected ? "primary" : "outline"}
                    onClick={() => setSelectedBatchId(b.id)}
                  >
                    {isSelected ? "✓ Current batch" : "Make current"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pickAndGo(b.id, "/instructor/plan")}>
                    Course plan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pickAndGo(b.id, "/instructor/sessions")}>
                    Sessions
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pickAndGo(b.id, "/instructor/attendance")}>
                    Attendance
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pickAndGo(b.id, "/instructor/grading")}>
                    Grading
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => pickAndGo(b.id, "/instructor/completion")}>
                    Completion
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-label uppercase tracking-wide text-ink-outline">{label}</p>
      <p className="text-ink capitalize">{value}</p>
    </div>
  );
}
