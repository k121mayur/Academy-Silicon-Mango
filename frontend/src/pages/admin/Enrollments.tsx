import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { extractErrorMessage } from "@/lib/api";
import { adminEnroll, listAllBatches, listAllEnrollments, listAllStudents, BatchDTO, StudentDTO } from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function AdminEnrollments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAllEnrollments();
      setItems(res.data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Enrollments</h1>
          <p className="text-body-sm text-ink-variant">All student enrollments across batches</p>
        </div>
        <Button leftIcon="person_add" onClick={() => setOpen(true)}>Enroll Student</Button>
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : error ? (
        <QueryErrorState error={error} onRetry={fetchData} title="Couldn't load enrollments" />
      ) : items.length === 0 ? (
        <EmptyState title="No enrollments yet" icon="how_to_reg" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Email</TH>
              <TH>Course</TH>
              <TH>Batch</TH>
              <TH>Enrolled</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((e) => (
              <TR key={e.id}>
                <TD className="font-medium">{e.student_name}</TD>
                <TD className="text-ink-variant">{e.student_email}</TD>
                <TD>{e.course_title}</TD>
                <TD>{e.batch_name}</TD>
                <TD>{formatDate(e.enrolled_at)}</TD>
                <TD><Badge tone={e.status === "active" ? "success" : "neutral"}>{e.status}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <EnrollModal open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); fetchData(); }} />
    </div>
  );
}

function EnrollModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [students, setStudents] = useState<StudentDTO[]>([]);
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStudentId(null);
      setBatchId(null);
      return;
    }
    setLoadingOptions(true);
    Promise.all([listAllStudents(), listAllBatches()])
      .then(([s, b]) => {
        setStudents(s);
        setBatches(b);
      })
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setLoadingOptions(false));
  }, [open]);

  const submit = async () => {
    if (!studentId || !batchId) return;
    setBusy(true);
    try {
      await adminEnroll({ student_id: studentId, batch_id: batchId });
      toast.success("Student enrolled");
      onDone();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enroll a student" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={!studentId || !batchId}>Enroll</Button>
      </>}
    >
      <div className="space-y-4">
        <SearchableSelect
          label="Student"
          placeholder="Select a student"
          loading={loadingOptions}
          options={students.map((s) => ({ value: s.user_id, label: s.display_name, sublabel: s.email }))}
          value={studentId}
          onChange={setStudentId}
          emptyText="No students found"
        />
        <SearchableSelect
          label="Batch"
          placeholder="Select a batch"
          loading={loadingOptions}
          options={batches.map((b) => ({ value: b.id, label: b.name, sublabel: b.course_title }))}
          value={batchId}
          onChange={setBatchId}
          emptyText="No batches found"
        />
      </div>
    </Modal>
  );
}
