import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { adminEnroll, listAllEnrollments, listBatches, listStudents } from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function AdminEnrollments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listAllEnrollments();
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
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
  const [studentSearch, setStudentSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [pickedStudent, setPickedStudent] = useState<any>(null);
  const [pickedBatch, setPickedBatch] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setPickedStudent(null);
      setPickedBatch(null);
      setStudentSearch("");
      setBatchSearch("");
      return;
    }
    listBatches({ limit: 50 }).then((r) => setBatches(r.data));
  }, [open]);

  const onStudentSearch = async (q: string) => {
    setStudentSearch(q);
    if (!q) return setStudents([]);
    const r = await listStudents({ search: q, limit: 8 });
    setStudents(r.data);
  };

  const submit = async () => {
    if (!pickedStudent || !pickedBatch) return;
    setBusy(true);
    try {
      await adminEnroll({ student_id: pickedStudent.user_id, batch_id: pickedBatch.id });
      toast.success("Student enrolled");
      onDone();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const filteredBatches = batches.filter((b) => !batchSearch || b.name.toLowerCase().includes(batchSearch.toLowerCase()));

  return (
    <Modal open={open} onClose={onClose} title="Enroll a student" size="md"
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={!pickedStudent || !pickedBatch}>Enroll</Button>
      </>}
    >
      <div className="space-y-4">
        <div>
          <p className="text-label text-ink-variant mb-2">Student</p>
          {pickedStudent ? (
            <div className="flex items-center justify-between bg-surface-containerLow rounded-xl p-3">
              <div>
                <p className="text-body-sm font-medium">{pickedStudent.display_name}</p>
                <p className="text-label text-ink-outline">{pickedStudent.email}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPickedStudent(null)} leftIcon="close" />
            </div>
          ) : (
            <>
              <Input placeholder="Search student" value={studentSearch} onChange={(e) => onStudentSearch(e.target.value)} leftIcon="search" />
              <div className="mt-2 max-h-40 overflow-y-auto scrollbar-thin">
                {students.map((s) => (
                  <button key={s.user_id} onClick={() => setPickedStudent(s)} className="w-full text-left p-2 hover:bg-surface-containerLow rounded">
                    <p className="text-body-sm font-medium">{s.display_name}</p>
                    <p className="text-label text-ink-outline">{s.email}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <p className="text-label text-ink-variant mb-2">Batch</p>
          {pickedBatch ? (
            <div className="flex items-center justify-between bg-surface-containerLow rounded-xl p-3">
              <div>
                <p className="text-body-sm font-medium">{pickedBatch.name}</p>
                <p className="text-label text-ink-outline">{pickedBatch.course_title}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPickedBatch(null)} leftIcon="close" />
            </div>
          ) : (
            <>
              <Input placeholder="Search batch" value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} leftIcon="search" />
              <div className="mt-2 max-h-40 overflow-y-auto scrollbar-thin">
                {filteredBatches.map((b) => (
                  <button key={b.id} onClick={() => setPickedBatch(b)} className="w-full text-left p-2 hover:bg-surface-containerLow rounded">
                    <p className="text-body-sm font-medium">{b.name}</p>
                    <p className="text-label text-ink-outline">{b.course_title}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
