import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { extractErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { formatWebinarWhen } from "@/services/webinar.service";
import {
  WebinarDTO,
  RegistrationDTO,
  CampaignDTO,
  WebinarReport,
  getWebinar,
  updateWebinar,
  publishWebinar,
  unpublishWebinar,
  cancelWebinar,
  listRegistrations,
  updateRegistration,
  deleteRegistration,
  resendRegistrationEmail,
  downloadRegistrationsCsv,
  listCampaigns,
  createCampaign,
  getWebinarReport,
} from "@/services/webinar.admin.service";

type Tab = "overview" | "registrations" | "emails" | "attendance" | "reports";

const STATUS_TONE: Record<string, "primary" | "danger" | "neutral" | "success" | "warning"> = {
  upcoming: "primary",
  live: "danger",
  past: "neutral",
  cancelled: "warning",
};

export default function WebinarDetailAdmin() {
  const { id } = useParams<{ id: string }>();
  const [w, setW] = useState<WebinarDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [reschedule, setReschedule] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      setW(await getWebinar(id));
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load webinar"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading || !w) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }

  const togglePublish = async () => {
    setBusy(true);
    try {
      if (w.is_published) await unpublishWebinar(w.id);
      else await publishWebinar(w.id);
      toast.success(w.is_published ? "Unpublished" : "Published");
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await cancelWebinar(w.id);
      toast.success("Webinar cancelled — registrants are being notified");
      setConfirmCancel(false);
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "registrations", label: `Registrations (${w.counts.total})` },
    { id: "emails", label: "Emails" },
    { id: "attendance", label: "Attendance" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/webinars" className="text-body-sm text-primary hover:underline inline-flex items-center gap-1">
          <span className="icon text-[16px]">arrow_back</span> Webinars
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3 mt-1">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-display-md text-ink">{w.title}</h1>
              <Badge tone={STATUS_TONE[w.status] || "neutral"}>{w.status}</Badge>
              <Badge tone={w.is_published ? "success" : "neutral"}>{w.is_published ? "Published" : "Draft"}</Badge>
            </div>
            <p className="text-body-sm text-ink-variant mt-1 flex items-center gap-1">
              <span className="icon text-[16px]">event</span>
              {formatWebinarWhen(w.start_at, w.timezone)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {w.is_published && (
              <a href={`/webinars/${w.slug}`} target="_blank" rel="noreferrer">
                <Button variant="outline" leftIcon="open_in_new">
                  Public page
                </Button>
              </a>
            )}
            <Link to={`/admin/webinars/${w.id}/edit`}>
              <Button variant="outline" leftIcon="edit">
                Edit
              </Button>
            </Link>
            {!w.is_cancelled && (
              <Button variant="outline" leftIcon="schedule" onClick={() => setReschedule(true)}>
                Reschedule
              </Button>
            )}
            <Button variant={w.is_published ? "ghost" : "primary"} onClick={togglePublish} loading={busy}>
              {w.is_published ? "Unpublish" : "Publish"}
            </Button>
            {!w.is_cancelled && (
              <Button variant="danger" leftIcon="cancel" onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-ink-outlineVariant/40 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 h-10 text-body-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-ink-variant hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab w={w} />}
      {tab === "registrations" && <RegistrationsTab webinarId={w.id} slug={w.slug} onChanged={reload} />}
      {tab === "emails" && <EmailsTab webinarId={w.id} counts={w.counts} />}
      {tab === "attendance" && <AttendanceTab webinarId={w.id} />}
      {tab === "reports" && <ReportsTab webinarId={w.id} />}

      {reschedule && <RescheduleModal w={w} onClose={() => setReschedule(false)} onSaved={() => { setReschedule(false); reload(); }} />}

      <ConfirmModal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={doCancel}
        title="Cancel webinar?"
        description="All verified registrants will be emailed that the webinar is cancelled. This cannot be undone."
        confirmLabel="Cancel webinar"
        destructive
        loading={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-surface-lowest border border-ink-outlineVariant/40 rounded-2xl p-4">
      <p className="font-display font-extrabold text-display-sm text-ink leading-none">{value}</p>
      <p className="text-label text-ink-outline uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

function OverviewTab({ w }: { w: WebinarDTO }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total" value={w.counts.total} />
        <Stat label="Verified" value={w.counts.verified} />
        <Stat label="Registered" value={w.counts.registered} />
        <Stat label="Waitlisted" value={w.counts.waitlisted} />
        <Stat label="Attended" value={w.counts.attended} />
      </div>

      <Card>
        <CardBody className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-body-sm">
          <Row label="Host" value={w.host?.name || "Silicon Mango"} />
          <Row label="Category" value={w.category || "—"} />
          <Row label="Language" value={w.language} />
          <Row label="Duration" value={`${w.duration_mins} mins`} />
          <Row label="When" value={formatWebinarWhen(w.start_at, w.timezone)} />
          <Row label="Time zone" value={w.timezone} />
          <Row label="Pricing" value={w.is_free ? "Free" : `${w.currency} ${w.price}`} />
          <Row label="Max participants" value={w.max_participants != null ? String(w.max_participants) : "Unlimited"} />
          <Row label="Waitlist" value={w.allow_waitlist ? "Enabled" : "Disabled"} />
          <Row label="Provider" value={w.provider_type} />
          <Row label="Meeting link" value={w.meeting_url || "—"} />
          <Row label="Join link public" value={w.meeting_link_public ? "Yes" : "No (emailed to registrants)"} />
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-ink-outlineVariant/20 pb-2">
      <span className="text-ink-outline">{label}</span>
      <span className="text-ink text-right break-all">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reschedule modal
// ---------------------------------------------------------------------------

function RescheduleModal({ w, onClose, onSaved }: { w: WebinarDTO; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState(w.start_at_local || "");
  const [end, setEnd] = useState(w.end_at_local || "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!start || !end) return toast.error("Pick a start and end time");
    if (new Date(end) <= new Date(start)) return toast.error("End must be after start");
    setSaving(true);
    try {
      await updateWebinar(w.id, { start_at: start, end_at: end, timezone: w.timezone });
      toast.success(
        w.is_published && w.counts.verified > 0
          ? "Rescheduled — registrants are being notified by email"
          : "Rescheduled"
      );
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
      title="Reschedule webinar"
      description={`Times are in ${w.timezone}. Verified registrants are emailed automatically.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} leftIcon="schedule">
            Reschedule
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Input label="New start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input label="New end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

const REG_STATUS_TONE: Record<string, "primary" | "neutral" | "success" | "warning"> = {
  registered: "success",
  pending_verification: "warning",
  waitlisted: "primary",
  cancelled: "neutral",
};

function RegistrationsTab({ webinarId, slug, onChanged }: { webinarId: string; slug: string; onChanged: () => void }) {
  const [rows, setRows] = useState<RegistrationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [confirmDel, setConfirmDel] = useState<RegistrationDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRegistrations(webinarId, { search: search || undefined, status: status || undefined });
      setRows(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [webinarId, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setAttendance = async (r: RegistrationDTO, value: string) => {
    try {
      await updateRegistration(webinarId, r.id, { attendance_status: value });
      fetchData();
      onChanged();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const resend = async (r: RegistrationDTO) => {
    try {
      const res = await resendRegistrationEmail(webinarId, r.id);
      toast.success(res.message || "Email re-sent");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const del = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await deleteRegistration(webinarId, confirmDel.id);
      toast.success("Registration removed");
      setConfirmDel(null);
      fetchData();
      onChanged();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon="search" containerClassName="flex-1 min-w-60" />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "All status" },
            { value: "registered", label: "Registered" },
            { value: "pending_verification", label: "Pending" },
            { value: "waitlisted", label: "Waitlisted" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          containerClassName="w-44"
        />
        <Button variant="outline" leftIcon="download" onClick={() => downloadRegistrationsCsv(webinarId, `${slug}-registrations.csv`)}>
          Export CSV
        </Button>
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No registrations yet" icon="how_to_reg" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Gender</TH>
              <TH>DOB</TH>
              <TH>Profession</TH>
              <TH>Status</TH>
              <TH>Attendance</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.full_name}</TD>
                <TD className="text-ink-variant">{r.email}</TD>
                <TD>{r.gender || "—"}</TD>
                <TD>{r.date_of_birth || "—"}</TD>
                <TD>{r.profession || "—"}</TD>
                <TD>
                  <Badge tone={REG_STATUS_TONE[r.status] || "neutral"}>{r.status.replace("_", " ")}</Badge>
                </TD>
                <TD>
                  <div className="flex gap-1">
                    <Button size="sm" variant={r.attendance_status === "present" ? "tertiary" : "ghost"} onClick={() => setAttendance(r, "present")}>
                      Present
                    </Button>
                    <Button size="sm" variant={r.attendance_status === "absent" ? "danger" : "ghost"} onClick={() => setAttendance(r, "absent")}>
                      Absent
                    </Button>
                  </div>
                </TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" leftIcon="forward_to_inbox" onClick={() => resend(r)} title="Resend email" />
                    <Button size="sm" variant="ghost" leftIcon="delete" className="text-danger" onClick={() => setConfirmDel(r)} />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={del}
        title="Remove registration?"
        description={`Remove ${confirmDel?.email} from this webinar?`}
        confirmLabel="Remove"
        destructive
        loading={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

function AttendanceTab({ webinarId }: { webinarId: string }) {
  const [rows, setRows] = useState<RegistrationDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRegistrations(webinarId, { status: "registered" });
      setRows(res.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mark = async (r: RegistrationDTO, value: string) => {
    try {
      await updateRegistration(webinarId, r.id, { attendance_status: value });
      setRows((arr) => arr.map((x) => (x.id === r.id ? { ...x, attendance_status: value } : x)));
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  if (loading) return <p className="text-body-sm text-ink-outline">Loading…</p>;
  if (rows.length === 0) return <EmptyState title="No confirmed registrants" description="Attendance can be marked once people confirm their registration." icon="fact_check" />;

  return (
    <Table>
      <THead>
        <tr>
          <TH>Name</TH>
          <TH>Email</TH>
          <TH className="text-right">Attendance</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-medium">{r.full_name}</TD>
            <TD className="text-ink-variant">{r.email}</TD>
            <TD className="text-right">
              <div className="inline-flex gap-1">
                <Button size="sm" variant={r.attendance_status === "present" ? "tertiary" : "outline"} onClick={() => mark(r, "present")}>
                  Present
                </Button>
                <Button size="sm" variant={r.attendance_status === "absent" ? "danger" : "outline"} onClick={() => mark(r, "absent")}>
                  Absent
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

function EmailsTab({ webinarId, counts }: { webinarId: string; counts: WebinarDTO["counts"] }) {
  const [campaigns, setCampaigns] = useState<CampaignDTO[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [sending, setSending] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setCampaigns(await listCampaigns(webinarId));
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  }, [webinarId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSending(true);
    try {
      await createCampaign(webinarId, { subject: subject.trim(), body, audience });
      toast.success("Email queued for sending");
      setSubject("");
      setBody("");
      fetchData();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card>
        <CardBody>
          <form onSubmit={send} className="space-y-4">
            <h3 className="font-display font-semibold text-title-md text-ink">Send an email</h3>
            <Select
              label="Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              options={[
                { value: "all", label: `All registrants (${counts.total})` },
                { value: "verified", label: `Verified only (${counts.verified})` },
                { value: "waitlisted", label: `Waitlisted (${counts.waitlisted})` },
              ]}
            />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea
              label="Message"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              hint="Basic HTML is supported. The Silicon Mango header/footer is added automatically."
            />
            <Button type="submit" loading={sending} leftIcon="send">
              Send email
            </Button>
          </form>
        </CardBody>
      </Card>

      <div>
        <h3 className="font-display font-semibold text-title-md text-ink mb-3">Sent emails</h3>
        {campaigns.length === 0 ? (
          <EmptyState title="No emails sent yet" icon="mail" />
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Card key={c.id}>
                <CardBody className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{c.subject}</p>
                    <p className="text-label text-ink-outline">
                      {c.audience} · {c.created_at ? formatDateTime(c.created_at) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={c.status === "sent" ? "success" : c.status === "failed" ? "danger" : "warning"}>{c.status}</Badge>
                    <p className="text-label text-ink-outline mt-1">{c.sent_count} sent</p>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function Bars({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <Card>
      <CardBody>
        <h3 className="font-display font-semibold text-title-md text-ink mb-3">{title}</h3>
        {entries.length === 0 ? (
          <p className="text-body-sm text-ink-outline">No data.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-body-sm text-ink-variant mb-0.5">
                  <span className="capitalize">{k.replace("_", " ")}</span>
                  <span className="font-medium text-ink">{v}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(v / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ReportsTab({ webinarId }: { webinarId: string }) {
  const [report, setReport] = useState<WebinarReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWebinarReport(webinarId)
      .then(setReport)
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [webinarId]);

  if (loading) return <p className="text-body-sm text-ink-outline">Loading…</p>;
  if (!report) return <EmptyState title="No report available" icon="analytics" />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Registrations" value={report.totals.registrations} />
        <Stat label="Verified" value={report.totals.verified} />
        <Stat label="Attended" value={report.totals.attended} />
        <Stat label="Verification rate" value={`${report.conversion.verification_rate}%`} />
        <Stat label="Attendance rate" value={`${report.conversion.attendance_rate}%`} />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Bars title="By gender" data={report.demographics.gender} />
        <Bars title="By profession" data={report.demographics.profession} />
        <Bars title="By age group" data={report.demographics.age_group} />
      </div>
    </div>
  );
}
