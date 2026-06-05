import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/utils";
import { extractErrorMessage } from "@/lib/api";
import { CourseDTO, deleteCourse, listCourses, togglePublishCourse } from "@/services/admin.service";

export default function AdminCourses() {
  const [items, setItems] = useState<CourseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [published, setPublished] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CourseDTO | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (type) params.type = type;
      if (published) params.published = published === "true";
      const res = await listCourses(params);
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load courses"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, published]);

  const onTogglePublish = async (c: CourseDTO) => {
    try {
      await togglePublishCourse(c.id);
      toast.success(c.is_published ? "Unpublished" : "Published");
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    setBusyDelete(true);
    try {
      await deleteCourse(confirmDelete.id);
      toast.success("Course deleted");
      setConfirmDelete(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Courses</h1>
          <p className="text-body-sm text-ink-variant">Create and manage your course catalog</p>
        </div>
        <Link to="/admin/courses/create">
          <Button leftIcon="add">Create Course</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search title or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon="search"
          containerClassName="flex-1 min-w-60"
        />
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: "", label: "All types" },
            { value: "live", label: "Live" },
            { value: "self_paced", label: "Self-paced" },
          ]}
          containerClassName="w-40"
        />
        <Select
          value={published}
          onChange={(e) => setPublished(e.target.value)}
          options={[
            { value: "", label: "All status" },
            { value: "true", label: "Published" },
            { value: "false", label: "Draft" },
          ]}
          containerClassName="w-40"
        />
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Click Create Course to add your first course."
          icon="menu_book"
          action={<Link to="/admin/courses/create"><Button leftIcon="add">Create Course</Button></Link>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Category</TH>
              <TH>Type</TH>
              <TH>Duration</TH>
              <TH>Price</TH>
              <TH>Batches</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((c) => (
              <TR key={c.id}>
                <TD>
                  <Link to={`/admin/courses/${c.id}/edit`} className="font-medium text-ink hover:text-primary">
                    {c.title}
                  </Link>
                  <p className="text-label text-ink-outline">/{c.slug}</p>
                </TD>
                <TD>{c.category || "—"}</TD>
                <TD>
                  <Badge tone={c.course_type === "live" ? "primary" : "tertiary"}>{c.course_type === "self_paced" ? "Self-paced" : "Live"}</Badge>
                </TD>
                <TD>{c.duration_value} {c.duration_unit}</TD>
                <TD className="font-mono">{formatCurrency(Math.max(Number(c.price) - (Number(c.price) * Number(c.discount || 0)) / 100, 0))}</TD>
                <TD>{c.batches_count ?? 0}</TD>
                <TD>
                  <Badge tone={c.is_published ? "success" : "neutral"}>{c.is_published ? "Published" : "Draft"}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/admin/courses/${c.id}/edit`}>
                      <Button size="sm" variant="ghost" leftIcon="edit">Edit</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => onTogglePublish(c)}>
                      {c.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="sm" variant="ghost" leftIcon="delete" onClick={() => setConfirmDelete(c)} className="text-danger" />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        title="Delete course?"
        description={`This will permanently remove "${confirmDelete?.title}". You can't delete a course that has batches — delete the batches first.`}
        confirmLabel="Delete"
        destructive
        loading={busyDelete}
      />
    </div>
  );
}
