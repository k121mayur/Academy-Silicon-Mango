import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { extractErrorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  SubscriberDTO,
  SubscriberStats,
  listSubscribers,
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
  exportSubscribersCsv,
} from "@/services/subscriber.service";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All Subscribers" },
  { value: "active", label: "Active Only" },
  { value: "inactive", label: "Inactive Only" },
];

export default function EmailSubscribers() {
  const [items, setItems] = useState<SubscriberDTO[]>([]);
  const [stats, setStats] = useState<SubscriberStats>({ total: 0, active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });

  // Add Subscriber modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newSource, setNewSource] = useState("admin_manual");
  const [creating, setCreating] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<SubscriberDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Action busy states
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: { page: number; limit: number; search?: string; status?: string } = {
        page,
        limit: PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;

      const res = await listSubscribers(params);
      setItems(res.data);
      if (res.meta) setMeta(res.meta);
      if (res.stats) setStats(res.stats);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load subscribers"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  const resetPage = () => setPage(1);

  const onExport = async () => {
    setExporting(true);
    try {
      const params: { search?: string; status?: string } = {};
      if (search.trim()) params.search = search.trim();
      if (status) params.status = status;
      await exportSubscribersCsv(params);
      toast.success("Subscribers list exported");
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to export subscribers"));
    } finally {
      setExporting(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    setCreating(true);
    try {
      await createSubscriber({
        email: newEmail.trim(),
        source: newSource.trim() || "admin_manual",
      });
      toast.success("Subscriber added successfully");
      setCreateOpen(false);
      setNewEmail("");
      setNewSource("admin_manual");
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to add subscriber"));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (sub: SubscriberDTO) => {
    setUpdatingId(sub.id);
    try {
      const nextStatus = !sub.is_active;
      await updateSubscriber(sub.id, { is_active: nextStatus });
      toast.success(nextStatus ? "Subscriber re-activated" : "Subscriber deactivated");
      setItems((prev) =>
        prev.map((item) => (item.id === sub.id ? { ...item, is_active: nextStatus } : item))
      );
      setStats((prev) => ({
        ...prev,
        active: nextStatus ? prev.active + 1 : Math.max(0, prev.active - 1),
        inactive: nextStatus ? Math.max(0, prev.inactive - 1) : prev.inactive + 1,
      }));
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to update subscriber status"));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSubscriber(deleteTarget.id);
      toast.success("Subscriber removed");
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to delete subscriber"));
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied email to clipboard");
  };

  const formatSource = (src?: string | null) => {
    if (!src) return "Website";
    return src
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Email Subscribers</h1>
          <p className="text-body-sm text-ink-variant">
            Manage newsletter subscriptions, lead opt-ins, and audience contacts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            leftIcon="download"
            onClick={onExport}
            loading={exporting}
            disabled={stats.total === 0}
          >
            Export to CSV
          </Button>
          <Button leftIcon="add" onClick={() => setCreateOpen(true)}>
            Add Subscriber
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-label text-ink-outline">Total Subscribers</p>
            <p className="text-display-sm font-display font-bold text-ink mt-0.5">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary-container/30 text-primary flex items-center justify-center">
            <span className="icon text-[22px]">mail</span>
          </div>
        </div>
        <div className="bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-label text-ink-outline">Active Subscribers</p>
            <p className="text-display-sm font-display font-bold text-tertiary mt-0.5">{stats.active}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#b3ecf5]/40 text-tertiary flex items-center justify-center">
            <span className="icon text-[22px]">check_circle</span>
          </div>
        </div>
        <div className="bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-label text-ink-outline">Inactive / Unsubscribed</p>
            <p className="text-display-sm font-display font-bold text-ink-outline mt-0.5">{stats.inactive}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-surface-container text-ink-variant flex items-center justify-center">
            <span className="icon text-[22px]">unsubscribe</span>
          </div>
        </div>
      </div>

      {/* Campaign Unsubscribe Banner */}
      <div className="bg-primary-container/20 border border-primary-container/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-container/40 text-primary flex items-center justify-center shrink-0">
            <span className="icon text-[20px]">link</span>
          </div>
          <div>
            <p className="text-body-sm font-semibold text-ink">Campaign Unsubscribe Link</p>
            <p className="text-caption text-ink-variant">
              Add this link to your email campaign templates or footers:{" "}
              <code className="bg-surface-lowest px-1.5 py-0.5 rounded text-primary font-mono text-[12px] select-all border border-ink-outlineVariant/30">
                {window.location.origin}/unsubscribe?email={"{{email}}"}
              </code>
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          leftIcon="content_copy"
          onClick={() => {
            copyToClipboard(`${window.location.origin}/unsubscribe?email={{email}}`);
          }}
        >
          Copy Link
        </Button>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by email, source, or reason..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
          leftIcon="search"
          containerClassName="flex-1 min-w-[240px]"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPage();
          }}
          options={STATUS_OPTIONS}
          containerClassName="w-48"
        />
        {(search || status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatus("");
              resetPage();
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Table / List */}
      <div className="bg-surface-lowest border border-ink-outlineVariant/30 rounded-2xl overflow-hidden shadow-sm">
        <Table>
          <THead>
            <TR>
              <TH>Subscriber Email</TH>
              <TH>Status</TH>
              <TH>Unsubscribe Feedback</TH>
              <TH>Source</TH>
              <TH>Subscribed Date</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TR key={i}>
                  <TD colSpan={6}>
                    <div className="h-6 bg-surface-container animate-pulse rounded my-1" />
                  </TD>
                </TR>
              ))
            ) : items.length === 0 ? (
              <TR>
                <TD colSpan={6}>
                  <EmptyState
                    icon="mail"
                    title={search || status ? "No matching subscribers" : "No subscribers yet"}
                    description={
                      search || status
                        ? "Try adjusting your search term or status filter."
                        : "When visitors subscribe to the newsletter on your landing page, they will appear here."
                    }
                    action={
                      search || status ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSearch("");
                            setStatus("");
                            resetPage();
                          }}
                        >
                          Reset Filters
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                          Add Subscriber
                        </Button>
                      )
                    }
                  />
                </TD>
              </TR>
            ) : (
              items.map((sub) => (
                <TR key={sub.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-container/40 text-primary-onContainer flex items-center justify-center shrink-0">
                        <span className="icon text-[16px]">mail</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-ink truncate select-all">{sub.email}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(sub.email)}
                            className="text-ink-outline hover:text-ink transition-colors p-0.5"
                            title="Copy email"
                          >
                            <span className="icon text-[14px]">content_copy</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="space-y-0.5">
                      <Badge tone={sub.is_active ? "success" : "neutral"}>
                        {sub.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {!sub.is_active && sub.unsubscribed_at && (
                        <p className="text-caption text-ink-outline" title={formatDateTime(sub.unsubscribed_at)}>
                          Left {formatDate(sub.unsubscribed_at)}
                        </p>
                      )}
                    </div>
                  </TD>
                  <TD>
                    {sub.unsubscribe_reason ? (
                      <div className="max-w-[220px]">
                        <p
                          className="text-body-sm text-ink italic bg-surface-container/50 px-2 py-1 rounded truncate border border-ink-outlineVariant/30"
                          title={sub.unsubscribe_reason}
                        >
                          “{sub.unsubscribe_reason}”
                        </p>
                      </div>
                    ) : (
                      <span className="text-ink-outline text-body-sm">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone="secondary" size="sm">
                      {formatSource(sub.source)}
                    </Badge>
                  </TD>
                  <TD className="text-body-sm text-ink-variant">
                    {sub.created_at ? (
                      <span title={formatDateTime(sub.created_at)}>{formatDate(sub.created_at)}</span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(`${window.location.origin}/unsubscribe?email=${encodeURIComponent(sub.email)}`)
                        }
                        title="Copy unsubscribe link for this subscriber"
                        className="text-ink-outline hover:text-ink"
                      >
                        <span className="icon text-[18px]">link</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={updatingId === sub.id}
                        onClick={() => handleToggleActive(sub)}
                        title={sub.is_active ? "Deactivate subscriber" : "Reactivate subscriber"}
                        className={
                          sub.is_active
                            ? "text-ink-variant hover:text-danger hover:bg-danger-container/20"
                            : "text-tertiary hover:bg-tertiary-container/30"
                        }
                      >
                        <span className="icon text-[18px]">
                          {sub.is_active ? "block" : "check_circle"}
                        </span>
                        <span className="hidden md:inline ml-1">
                          {sub.is_active ? "Deactivate" : "Activate"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(sub)}
                        title="Delete subscriber"
                        className="text-ink-outline hover:text-danger hover:bg-danger-container/20"
                      >
                        <span className="icon text-[18px]">delete</span>
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>

        {meta.pages > 1 && (
          <div className="p-4 border-t border-ink-outlineVariant/30">
            <Pagination
              page={meta.page}
              pages={meta.pages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Add Subscriber Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Email Subscriber"
        description="Directly add or re-activate a subscriber in the newsletter database."
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. subscriber@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Subscription Source (optional)"
            placeholder="e.g. admin_manual, webinar, offline_event"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Add Subscriber
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Remove Email Subscriber"
        description={
          deleteTarget
            ? `Are you sure you want to permanently delete "${deleteTarget.email}" from the newsletter subscribers list?`
            : ""
        }
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
