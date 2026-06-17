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
import { formatDate } from "@/lib/utils";
import { extractErrorMessage } from "@/lib/api";
import { BlogDTO, deleteBlog, listBlogs, togglePublishBlog } from "@/services/blog.service";

export default function AdminBlogs() {
  const [items, setItems] = useState<BlogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<BlogDTO | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await listBlogs(params);
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load posts"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const onTogglePublish = async (b: BlogDTO) => {
    try {
      await togglePublishBlog(b.id);
      toast.success(b.is_published ? "Unpublished" : "Published");
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    setBusyDelete(true);
    try {
      await deleteBlog(confirmDelete.id);
      toast.success("Post deleted");
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
          <h1 className="font-display font-bold text-display-md text-ink">Blog Posts</h1>
          <p className="text-body-sm text-ink-variant">Write and manage posts shown on the public blog</p>
        </div>
        <Link to="/admin/blog/create">
          <Button leftIcon="add">New Post</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search title, author or slug"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon="search"
          containerClassName="flex-1 min-w-60"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All status" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]}
          containerClassName="w-40"
        />
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description="Click New Post to write your first blog post."
          icon="article"
          action={<Link to="/admin/blog/create"><Button leftIcon="add">New Post</Button></Link>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Author</TH>
              <TH>Tags</TH>
              <TH>Views</TH>
              <TH>Published</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link to={`/admin/blog/${b.id}/edit`} className="font-medium text-ink hover:text-primary">
                    {b.title}
                  </Link>
                  <p className="text-label text-ink-outline">/{b.slug}</p>
                </TD>
                <TD>{b.author}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1 max-w-[14rem]">
                    {(b.tags || []).slice(0, 3).map((t) => (
                      <Badge key={t} tone="neutral">{t}</Badge>
                    ))}
                    {(b.tags || []).length > 3 && (
                      <span className="text-label text-ink-outline self-center">+{b.tags.length - 3}</span>
                    )}
                    {(b.tags || []).length === 0 && <span className="text-ink-outline">—</span>}
                  </div>
                </TD>
                <TD>{b.view_count}</TD>
                <TD>{b.published_at ? formatDate(b.published_at) : "—"}</TD>
                <TD>
                  <Badge tone={b.is_published ? "success" : "neutral"}>{b.is_published ? "Published" : "Draft"}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/admin/blog/${b.id}/edit`}>
                      <Button size="sm" variant="ghost" leftIcon="edit">Edit</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => onTogglePublish(b)}>
                      {b.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button size="sm" variant="ghost" leftIcon="delete" onClick={() => setConfirmDelete(b)} className="text-danger" />
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
        title="Delete post?"
        description={`This will permanently remove "${confirmDelete?.title}".`}
        confirmLabel="Delete"
        destructive
        loading={busyDelete}
      />
    </div>
  );
}
