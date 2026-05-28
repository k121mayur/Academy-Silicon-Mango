import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { extractErrorMessage } from "@/lib/api";
import {
  listBatches,
  listInstructors,
  batchAssignInstructor,
  BatchDTO,
  InstructorDTO,
} from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function AdminBatches() {
  const [items, setItems] = useState<BatchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [assignBatch, setAssignBatch] = useState<BatchDTO | null>(null);
  const [instructors, setInstructors] = useState<InstructorDTO[]>([]);
  const [instructorSearch, setInstructorSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (status) params.status = status;
      if (mode) params.mode = mode;
      const res = await listBatches(params);
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load batches"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, mode]);

  const openAssign = async (b: BatchDTO) => {
    setAssignBatch(b);
    setInstructorSearch("");
    try {
      const res = await listInstructors({ limit: 100 });
      setInstructors(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const doAssign = async (instructorUserId: string | null) => {
    if (!assignBatch) return;
    setAssigning(true);
    try {
      await batchAssignInstructor(assignBatch.id, instructorUserId ?? "");
      toast.success(instructorUserId ? "Instructor assigned" : "Instructor cleared");
      setAssignBatch(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Batches</h1>
          <p className="text-body-sm text-ink-variant">Cohorts and class schedules</p>
        </div>
        <Link to="/admin/batches/create">
          <Button leftIcon="add">Create Batch</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search batches" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon="search" containerClassName="flex-1 min-w-60" />
        <Select value={mode} onChange={(e) => setMode(e.target.value)} options={[
          { value: "", label: "All modes" },
          { value: "live", label: "Live" },
          { value: "recorded", label: "Recorded" },
        ]} containerClassName="w-40" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[
          { value: "", label: "All status" },
          { value: "upcoming", label: "Upcoming" },
          { value: "active", label: "Active" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
        ]} containerClassName="w-40" />
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No batches yet" icon="groups_2" action={
          <Link to="/admin/batches/create"><Button leftIcon="add">Create Batch</Button></Link>
        } />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Course</TH>
              <TH>Mode</TH>
              <TH>Instructor</TH>
              <TH>Start</TH>
              <TH>End</TH>
              <TH>Capacity</TH>
              <TH>Enrolled</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((b) => {
              const unassigned = !b.instructor_id;
              return (
                <TR key={b.id}>
                  <TD>
                    <Link to={`/admin/batches/${b.id}`} className="font-medium text-ink hover:text-primary">{b.name}</Link>
                  </TD>
                  <TD>{b.course_title}</TD>
                  <TD><Badge tone={b.delivery_mode === "live" ? "primary" : "tertiary"}>{b.delivery_mode}</Badge></TD>
                  <TD>
                    {b.instructor_name ? (
                      <span className="text-ink">{b.instructor_name}</span>
                    ) : (
                      <span className="text-[#6b4c00]">⚠ Unassigned</span>
                    )}
                  </TD>
                  <TD>{formatDate(b.start_date)}</TD>
                  <TD>{formatDate(b.end_date)}</TD>
                  <TD>{b.capacity ?? "—"}</TD>
                  <TD>{b.enrolled_count}</TD>
                  <TD>
                    <Badge tone={
                      b.status === "active" ? "success"
                      : b.status === "upcoming" ? "primary"
                      : b.status === "completed" ? "neutral"
                      : "danger"
                    }>{b.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant={unassigned ? "primary" : "outline"}
                        leftIcon={unassigned ? "person_add" : "edit"}
                        onClick={() => openAssign(b)}
                        disabled={b.is_locked}
                      >
                        {unassigned ? "Assign" : "Change"}
                      </Button>
                      <Link to={`/admin/batches/${b.id}`}>
                        <Button size="sm" variant="ghost" leftIcon="visibility">View</Button>
                      </Link>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <Modal
        open={!!assignBatch}
        onClose={() => setAssignBatch(null)}
        title={assignBatch ? `Assign instructor to "${assignBatch.name}"` : ""}
        description="Pick any instructor to assign directly to this batch."
        size="md"
      >
        {assignBatch && (
          <div className="space-y-2">
            <Input
              placeholder="Search instructors by name or email"
              value={instructorSearch}
              onChange={(e) => setInstructorSearch(e.target.value)}
              leftIcon="search"
              autoFocus
            />
            {assignBatch.instructor_id && (
              <button
                onClick={() => doAssign(null)}
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
              {instructors.length === 0 ? (
                <div className="p-4 bg-surface-containerLow rounded-md text-body-sm text-ink-variant">
                  No instructors found. Create one from the Instructors page first.
                </div>
              ) : (
                instructors
                  .filter((i) => {
                    if (!instructorSearch) return true;
                    const q = instructorSearch.toLowerCase();
                    return (
                      i.display_name?.toLowerCase().includes(q) ||
                      i.email?.toLowerCase().includes(q)
                    );
                  })
                  .map((i) => {
                    const isCurrent = assignBatch.instructor_id === i.user_id;
                    return (
                      <button
                        key={i.user_id}
                        onClick={() => !isCurrent && doAssign(i.user_id)}
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
        )}
      </Modal>
    </div>
  );
}
