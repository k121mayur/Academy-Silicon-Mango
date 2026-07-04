import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { extractErrorMessage } from "@/lib/api";
import {
  adminEnroll,
  exportEnrollmentsCsv,
  listAllBatches,
  listAllEnrollments,
  listAllStudents,
  unenrollStudent,
  BatchDTO,
  EnrollmentRow,
  StudentDTO,
} from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 10;

export default function AdminEnrollments() {
  const [items, setItems] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [allBatches, setAllBatches] = useState<BatchDTO[]>([]);
  const [exporting, setExporting] = useState(false);
  const [unenrollTarget, setUnenrollTarget] = useState<EnrollmentRow | null>(null);
  const [unenrolling, setUnenrolling] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, limit: PAGE_SIZE };
      if (search) params.search = search;
      if (courseId) params.course_id = courseId;
      if (batchId) params.batch_id = batchId;
      if (status) params.status = status;
      const res = await listAllEnrollments(params);
      setItems(res.data);
      if (res.meta) setMeta(res.meta);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [search, courseId, batchId, status, page]);
  useEffect(() => { listAllBatches().then(setAllBatches).catch(() => {}); }, []);

  const resetPage = () => setPage(1);

  const courseOptions = Array.from(
    new Map(allBatches.map((b) => [b.course_id, b.course_title || b.course_id])).entries()
  );

  const onExport = async () => {
    setExporting(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (courseId) params.course_id = courseId;
      if (batchId) params.batch_id = batchId;
      if (status) params.status = status;
      await exportEnrollmentsCsv(params);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to export enrollments"));
    } finally {
      setExporting(false);
    }
  };

  const confirmUnenroll = async () => {
    if (!unenrollTarget) return;
    setUnenrolling(true);
    try {
      await unenrollStudent(unenrollTarget.batch_id, unenrollTarget.id);
      toast.success(`${unenrollTarget.student_name} unenrolled from ${unenrollTarget.batch_name}`);
      setUnenrollTarget(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to unenroll student"));
    } finally {
      setUnenrolling(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Enrollments</h1>
          <p className="text-body-sm text-ink-variant">All student enrollments across batches</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" leftIcon="download" onClick={onExport} loading={exporting}>Export to Excel</Button>
          <Button leftIcon="person_add" onClick={() => setOpen(true)}>Enroll Student</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by student name or email"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          leftIcon="search"
          containerClassName="flex-1 min-w-60"
        />
        <Select
          value={courseId}
          onChange={(e) => { setCourseId(e.target.value); resetPage(); }}
          options={[{ value: "", label: "All courses" }, ...courseOptions.map(([id, title]) => ({ value: id, label: title }))]}
          containerClassName="w-48"
        />
        <Select
          value={batchId}
          onChange={(e) => { setBatchId(e.target.value); resetPage(); }}
          options={[{ value: "", label: "All batches" }, ...allBatches.map((b) => ({ value: b.id, label: b.name }))]}
          containerClassName="w-48"
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          options={[
            { value: "", label: "All status" },
            { value: "active", label: "Active" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          containerClassName="w-40"
        />
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
              <TH className="text-right">Actions</TH>
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
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon="person_remove"
                    className="text-danger hover:bg-danger-container/40"
                    onClick={() => setUnenrollTarget(e)}
                  >
                    Unenroll
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {!loading && !error && items.length > 0 && (
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
      )}

      <EnrollModal open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); fetchData(); }} />

      <ConfirmModal
        open={!!unenrollTarget}
        onClose={() => setUnenrollTarget(null)}
        onConfirm={confirmUnenroll}
        title="Unenroll student?"
        description={`This removes ${unenrollTarget?.student_name || "the student"}'s enrollment in "${unenrollTarget?.batch_name}". Their paid fee will no longer count toward revenue. Their account and payment record are kept for reference.`}
        confirmLabel="Unenroll"
        destructive
        loading={unenrolling}
      />
    </div>
  );
}

function EnrollModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [students, setStudents] = useState<StudentDTO[]>([]);
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [feePaid, setFeePaid] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setStudentId(null);
      setBatchId(null);
      setFeePaid(true);
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
      await adminEnroll({ student_id: studentId, batch_id: batchId, fee_paid: feePaid });
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
        <label className="flex items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={feePaid}
            onChange={(e) => setFeePaid(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Fees paid
        </label>
      </div>
    </Modal>
  );
}
