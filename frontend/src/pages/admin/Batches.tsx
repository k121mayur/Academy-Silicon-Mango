import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { listBatches, BatchDTO } from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function AdminBatches() {
  const [items, setItems] = useState<BatchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");

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
            {items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link to={`/admin/batches/${b.id}`} className="font-medium text-ink hover:text-primary">{b.name}</Link>
                </TD>
                <TD>{b.course_title}</TD>
                <TD><Badge tone={b.delivery_mode === "live" ? "primary" : "tertiary"}>{b.delivery_mode}</Badge></TD>
                <TD>{b.instructor_name || <span className="text-ink-outline">Unassigned</span>}</TD>
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
                  <Link to={`/admin/batches/${b.id}`}>
                    <Button size="sm" variant="ghost" leftIcon="visibility">View</Button>
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
