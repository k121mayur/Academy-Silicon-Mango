import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileUpload } from "@/components/shared/FileUpload";
import { formatCurrency } from "@/lib/utils";
import { extractErrorMessage, absoluteApiUrl } from "@/lib/api";
import {
  WebinarListItem,
  OrganizationDTO,
  listWebinars,
  deleteWebinar,
  publishWebinar,
  unpublishWebinar,
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  uploadOrganizationLogo,
} from "@/services/webinar.admin.service";
import { formatWebinarWhen } from "@/services/webinar.service";

const STATUS_TONE: Record<string, "primary" | "danger" | "neutral" | "success"> = {
  upcoming: "primary",
  live: "danger",
  past: "neutral",
  cancelled: "neutral",
};

export default function AdminWebinars() {
  const [tab, setTab] = useState<"webinars" | "hosts">("webinars");
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Webinar Management</h1>
          <p className="text-body-sm text-ink-variant">Create webinars, manage hosts, registrations and communications.</p>
        </div>
        {tab === "webinars" && (
          <Link to="/admin/webinars/create">
            <Button leftIcon="add">Create Webinar</Button>
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-ink-outlineVariant/40">
        {[
          { id: "webinars", label: "Webinars" },
          { id: "hosts", label: "Hosts" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as "webinars" | "hosts")}
            className={`px-4 h-10 text-body-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-ink-variant hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "webinars" ? <WebinarsTab /> : <HostsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webinars tab
// ---------------------------------------------------------------------------

function WebinarsTab() {
  const [items, setItems] = useState<WebinarListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [published, setPublished] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<WebinarListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 100 };
      if (search) params.search = search;
      if (status) params.status = status;
      if (published) params.published = published === "true";
      const res = await listWebinars(params);
      setItems(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load webinars"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, published]);

  const onTogglePublish = async (w: WebinarListItem) => {
    try {
      if (w.is_published) await unpublishWebinar(w.id);
      else await publishWebinar(w.id);
      toast.success(w.is_published ? "Unpublished" : "Published");
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteWebinar(confirmDelete.id);
      toast.success("Webinar deleted");
      setConfirmDelete(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search title or category"
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
            { value: "upcoming", label: "Upcoming" },
            { value: "live", label: "Live" },
            { value: "past", label: "Past" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          containerClassName="w-40"
        />
        <Select
          value={published}
          onChange={(e) => setPublished(e.target.value)}
          options={[
            { value: "", label: "Draft & Published" },
            { value: "true", label: "Published" },
            { value: "false", label: "Draft" },
          ]}
          containerClassName="w-44"
        />
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No webinars yet"
          description="Click Create Webinar to schedule your first one."
          icon="co_present"
          action={
            <Link to="/admin/webinars/create">
              <Button leftIcon="add">Create Webinar</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Host</TH>
              <TH>When</TH>
              <TH>Price</TH>
              <TH>Regs</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((w) => (
              <TR key={w.id}>
                <TD>
                  <Link to={`/admin/webinars/${w.id}`} className="font-medium text-ink hover:text-primary">
                    {w.title}
                  </Link>
                  <p className="text-label text-ink-outline">/{w.slug}</p>
                </TD>
                <TD className="text-ink-variant">{w.host?.name || "—"}</TD>
                <TD className="text-ink-variant">{formatWebinarWhen(w.start_at, w.timezone)}</TD>
                <TD className="font-mono">{w.is_free ? "Free" : formatCurrency(w.price, w.currency)}</TD>
                <TD>{w.registrations_count}</TD>
                <TD>
                  <div className="flex flex-col gap-1">
                    <Badge tone={STATUS_TONE[w.status] || "neutral"}>{w.status}</Badge>
                    <Badge tone={w.is_published ? "success" : "neutral"}>{w.is_published ? "Published" : "Draft"}</Badge>
                  </div>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/admin/webinars/${w.id}`}>
                      <Button size="sm" variant="ghost" leftIcon="visibility">
                        View
                      </Button>
                    </Link>
                    <Link to={`/admin/webinars/${w.id}/edit`}>
                      <Button size="sm" variant="ghost" leftIcon="edit" />
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => onTogglePublish(w)}>
                      {w.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="delete"
                      onClick={() => setConfirmDelete(w)}
                      className="text-danger"
                    />
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
        title="Delete webinar?"
        description={`This permanently removes "${confirmDelete?.title}" and all its registrations. To notify registrants instead, cancel it.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hosts tab
// ---------------------------------------------------------------------------

function HostsTab() {
  const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrganizationDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<OrganizationDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      setOrgs(await listOrganizations());
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load hosts"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteOrganization(confirmDelete.id);
      toast.success("Host deleted");
      setConfirmDelete(null);
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-body-sm text-ink-variant">
          Brands a webinar is presented under. The default Silicon Mango host is used unless you pick another.
        </p>
        <Button leftIcon="add" onClick={() => setCreating(true)}>
          Add Host
        </Button>
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((o) => (
            <div key={o.id} className="bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl p-4 flex gap-3">
              {o.logo_url ? (
                <img src={absoluteApiUrl(o.logo_url)} alt={o.name} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
                  <span className="icon">apartment</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink truncate">{o.name}</p>
                  {o.is_default && <Badge tone="primary">Default</Badge>}
                </div>
                <p className="text-label text-ink-outline truncate">{o.contact_email || o.website || "—"}</p>
                <p className="text-label text-ink-outline">{o.webinars_count} webinar(s)</p>
                <div className="flex gap-1 mt-2">
                  <Button size="sm" variant="ghost" leftIcon="edit" onClick={() => setEditing(o)}>
                    Edit
                  </Button>
                  {!o.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="delete"
                      className="text-danger"
                      onClick={() => setConfirmDelete(o)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <HostModal
          org={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            fetchData();
          }}
        />
      )}

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        title="Delete host?"
        description={`"${confirmDelete?.name}" will be removed. Its webinars stay live and fall back to the default brand.`}
        confirmLabel="Delete"
        destructive
        loading={busy}
      />
    </div>
  );
}

function HostModal({
  org,
  onClose,
  onSaved,
}: {
  org: OrganizationDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(org?.name || "");
  const [website, setWebsite] = useState(org?.website || "");
  const [contactEmail, setContactEmail] = useState(org?.contact_email || "");
  const [description, setDescription] = useState(org?.description || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Host name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        website: website.trim() || null,
        contact_email: contactEmail.trim() || null,
        description: description.trim() || null,
      };
      const saved = org ? await updateOrganization(org.id, payload) : await createOrganization(payload);
      if (logoFile) await uploadOrganizationLogo(saved.id, logoFile);
      toast.success(org ? "Host updated" : "Host added");
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={org ? "Edit host" : "Add host"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="EcoBasket" />
        <Input label="Website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
        <Input
          label="Contact email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="hello@example.com"
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <FileUpload
          label="Logo"
          accept="image/*"
          preview
          value={org?.logo_url ? absoluteApiUrl(org.logo_url) : null}
          onChange={(f) => setLogoFile(f)}
        />
      </form>
    </Modal>
  );
}
