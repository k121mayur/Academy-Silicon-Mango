import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FileUpload } from "@/components/shared/FileUpload";
import { Spinner } from "@/components/ui/Spinner";
import { extractErrorMessage, absoluteApiUrl } from "@/lib/api";
import {
  OrganizationDTO,
  WebinarFormPayload,
  listOrganizations,
  getWebinar,
  createWebinar,
  updateWebinar,
  uploadWebinarFlyer,
  uploadWebinarBanner,
} from "@/services/webinar.admin.service";

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const PROVIDERS = [
  { value: "manual_link", label: "Manual link (Meet / Jitsi / Zoom URL)" },
  { value: "google_meet", label: "Google Meet" },
  { value: "zoom", label: "Zoom" },
  { value: "webex", label: "Webex" },
  { value: "teams", label: "Microsoft Teams" },
];

const CATEGORIES = ["Technology", "Data Science", "NGO Management", "Finance", "Career Guidance", "Other"];

const EMAIL_FIELDS: { key: string; label: string }[] = [
  { key: "confirmation", label: "Registration confirmation" },
  { key: "reminder_7d", label: "Reminder · 7 days before" },
  { key: "reminder_1d", label: "Reminder · 1 day before" },
  { key: "reminder_1h", label: "Reminder · 1 hour before" },
  { key: "start", label: "Webinar starting now" },
  { key: "followup", label: "Thank-you follow-up" },
];

const DEFAULT_EMAIL_SETTINGS: Record<string, boolean> = {
  confirmation: true,
  reminder_7d: true,
  reminder_1d: true,
  reminder_1h: true,
  start: true,
  followup: false,
};

interface FormState {
  title: string;
  subtitle: string;
  description: string;
  category: string;
  language: string;
  organization_id: string;
  start_at: string;
  end_at: string;
  timezone: string;
  registration_open_at: string;
  registration_close_at: string;
  max_participants: string;
  allow_waitlist: boolean;
  is_free: boolean;
  price: string;
  currency: string;
  provider_type: string;
  meeting_url: string;
  meeting_link_public: boolean;
  meta_title: string;
  meta_description: string;
}

const EMPTY: FormState = {
  title: "",
  subtitle: "",
  description: "",
  category: "",
  language: "English",
  organization_id: "",
  start_at: "",
  end_at: "",
  timezone: "Asia/Kolkata",
  registration_open_at: "",
  registration_close_at: "",
  max_participants: "",
  allow_waitlist: false,
  is_free: true,
  price: "",
  currency: "INR",
  provider_type: "manual_link",
  meeting_url: "",
  meeting_link_public: false,
  meta_title: "",
  meta_description: "",
};

export default function WebinarForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const nav = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);
  const [emailSettings, setEmailSettings] = useState<Record<string, boolean>>(DEFAULT_EMAIL_SETTINGS);
  const [orgs, setOrgs] = useState<OrganizationDTO[]>([]);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [flyerUrl, setFlyerUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    listOrganizations()
      .then((o) => {
        setOrgs(o);
        // default host preselected on create
        setForm((f) => {
          if (f.organization_id) return f;
          const def = o.find((x) => x.is_default) || o[0];
          return def ? { ...f, organization_id: def.id } : f;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit || !id) return;
    setLoading(true);
    getWebinar(id)
      .then((w) => {
        setForm({
          title: w.title,
          subtitle: w.subtitle || "",
          description: w.description || "",
          category: w.category || "",
          language: w.language || "English",
          organization_id: w.organization_id || "",
          start_at: w.start_at_local || "",
          end_at: w.end_at_local || "",
          timezone: w.timezone || "Asia/Kolkata",
          registration_open_at: w.registration_open_at_local || "",
          registration_close_at: w.registration_close_at_local || "",
          max_participants: w.max_participants != null ? String(w.max_participants) : "",
          allow_waitlist: w.allow_waitlist,
          is_free: w.is_free,
          price: w.price ? String(w.price) : "",
          currency: w.currency || "INR",
          provider_type: w.provider_type || "manual_link",
          meeting_url: w.meeting_url || "",
          meeting_link_public: w.meeting_link_public,
          meta_title: w.meta_title || "",
          meta_description: w.meta_description || "",
        });
        setFaqs(w.faqs || []);
        setEmailSettings({ ...DEFAULT_EMAIL_SETTINGS, ...(w.email_settings || {}) });
        setFlyerUrl(w.flyer_url ? absoluteApiUrl(w.flyer_url) : null);
        setBannerUrl(w.banner_url ? absoluteApiUrl(w.banner_url) : null);
      })
      .catch((e) => toast.error(extractErrorMessage(e, "Failed to load webinar")))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const validate = (): boolean => {
    const fail = (msg: string) => {
      toast.error(msg);
      return false;
    };
    if (!form.title.trim()) return fail("Title is required");
    if (!form.start_at) return fail("Start date & time is required");
    if (!form.end_at) return fail("End date & time is required");
    if (new Date(form.end_at) <= new Date(form.start_at)) return fail("End must be after start");
    if (!form.is_free && (!form.price || Number(form.price) <= 0)) return fail("Set a price for a paid webinar");
    if (form.meeting_url && !/^https?:\/\//.test(form.meeting_url))
      return fail("Meeting link must start with http:// or https://");
    return true;
  };

  const buildPayload = (): WebinarFormPayload => ({
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || null,
    description: form.description.trim() || null,
    category: form.category || null,
    language: form.language || "English",
    organization_id: form.organization_id || null,
    start_at: form.start_at,
    end_at: form.end_at,
    timezone: form.timezone,
    registration_open_at: form.registration_open_at || null,
    registration_close_at: form.registration_close_at || null,
    max_participants: form.max_participants ? Number(form.max_participants) : null,
    allow_waitlist: form.allow_waitlist,
    is_free: form.is_free,
    price: form.is_free ? 0 : Number(form.price),
    currency: form.currency || "INR",
    provider_type: form.provider_type,
    meeting_url: form.meeting_url.trim() || null,
    meeting_link_public: form.meeting_link_public,
    faqs: faqs.filter((f) => f.question.trim() && f.answer.trim()),
    email_settings: emailSettings,
    meta_title: form.meta_title.trim() || null,
    meta_description: form.meta_description.trim() || null,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = isEdit && id ? await updateWebinar(id, payload) : await createWebinar(payload);
      if (flyerFile) await uploadWebinarFlyer(saved.id, flyerFile);
      if (bannerFile) await uploadWebinarBanner(saved.id, bannerFile);
      toast.success(isEdit ? "Webinar updated" : "Webinar created");
      nav(`/admin/webinars/${saved.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/admin/webinars" className="text-body-sm text-primary hover:underline inline-flex items-center gap-1">
            <span className="icon text-[16px]">arrow_back</span> Webinars
          </Link>
          <h1 className="font-display font-bold text-display-md text-ink">{isEdit ? "Edit webinar" : "Create webinar"}</h1>
          {isEdit && (
            <p className="text-body-sm text-ink-variant">
              Changing the date/time of a published webinar will email all registrants automatically.
            </p>
          )}
        </div>
        <Button type="submit" loading={saving} leftIcon="save">
          {isEdit ? "Save changes" : "Create webinar"}
        </Button>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Webinar information</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Building AI Apps with Claude" />
          <Input label="Subtitle" value={form.subtitle} onChange={(e) => update("subtitle", e.target.value)} />
          <Textarea label="Description" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} />
          <div className="grid sm:grid-cols-3 gap-4">
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              options={[{ value: "", label: "Select…" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
            <Input label="Language" value={form.language} onChange={(e) => update("language", e.target.value)} />
            <Select
              label="Host / Brand"
              value={form.organization_id}
              onChange={(e) => update("organization_id", e.target.value)}
              options={orgs.map((o) => ({ value: o.id, label: o.is_default ? `${o.name} (default)` : o.name }))}
            />
          </div>
          <p className="text-label text-ink-outline">
            Manage hosts under Webinars → Hosts. The default Silicon Mango brand is used unless you choose another.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <FileUpload label="Flyer (card image)" accept="image/*" preview cropAspectRatio={4 / 3} value={flyerUrl} onChange={setFlyerFile} />
            <FileUpload label="Banner (detail hero, optional)" accept="image/*" preview cropAspectRatio={16 / 9} value={bannerUrl} onChange={setBannerFile} />
          </div>
        </CardBody>
      </Card>

      {/* Schedule */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Schedule</h2>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-3 gap-4">
          <Input label="Start" type="datetime-local" value={form.start_at} onChange={(e) => update("start_at", e.target.value)} />
          <Input label="End" type="datetime-local" value={form.end_at} onChange={(e) => update("end_at", e.target.value)} />
          <Select label="Time zone" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
        </CardBody>
      </Card>

      {/* Registration */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Registration settings</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Registration opens (optional)" type="datetime-local" value={form.registration_open_at} onChange={(e) => update("registration_open_at", e.target.value)} />
            <Input label="Registration closes (optional)" type="datetime-local" value={form.registration_close_at} onChange={(e) => update("registration_close_at", e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 items-end">
            <Input label="Max participants (optional)" type="number" min={1} value={form.max_participants} onChange={(e) => update("max_participants", e.target.value)} />
            <label className="flex items-center gap-2 h-10 text-body-sm text-ink">
              <input type="checkbox" checked={form.allow_waitlist} onChange={(e) => update("allow_waitlist", e.target.checked)} className="w-4 h-4 accent-primary" />
              Allow waitlist when full
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Pricing</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input type="checkbox" checked={form.is_free} onChange={(e) => update("is_free", e.target.checked)} className="w-4 h-4 accent-primary" />
            This webinar is free
          </label>
          {!form.is_free && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Price" type="number" min={0} value={form.price} onChange={(e) => update("price", e.target.value)} />
              <Input label="Currency" value={form.currency} onChange={(e) => update("currency", e.target.value)} />
            </div>
          )}
          {!form.is_free && (
            <p className="text-label text-ink-outline">
              Paid webinars are stored and shown as paid; online payment collection is part of a later phase.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Access */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Webinar access</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Provider" value={form.provider_type} onChange={(e) => update("provider_type", e.target.value)} options={PROVIDERS} />
            <Input label="Meeting link" value={form.meeting_url} onChange={(e) => update("meeting_url", e.target.value)} placeholder="https://meet.google.com/…" leftIcon="link" />
          </div>
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input type="checkbox" checked={form.meeting_link_public} onChange={(e) => update("meeting_link_public", e.target.checked)} className="w-4 h-4 accent-primary" />
            Show the join link publicly on the webinar page (Google-Meet style)
          </label>
          <p className="text-label text-ink-outline">
            When off, the link is only emailed to verified registrants. Registrants always receive the link by email regardless.
          </p>
        </CardBody>
      </Card>

      {/* Email settings */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Automated emails</h2>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-2 gap-3">
          {EMAIL_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-body-sm text-ink">
              <input
                type="checkbox"
                checked={!!emailSettings[f.key]}
                onChange={(e) => setEmailSettings((s) => ({ ...s, [f.key]: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              {f.label}
            </label>
          ))}
        </CardBody>
      </Card>

      {/* FAQs */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-title-lg text-ink">FAQs</h2>
          <Button type="button" size="sm" variant="outline" leftIcon="add" onClick={() => setFaqs((f) => [...f, { question: "", answer: "" }])}>
            Add FAQ
          </Button>
        </CardHeader>
        <CardBody className="space-y-4">
          {faqs.length === 0 && <p className="text-body-sm text-ink-outline">No FAQs yet.</p>}
          {faqs.map((f, i) => (
            <div key={i} className="space-y-2 border border-ink-outlineVariant/40 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <Input
                  containerClassName="flex-1"
                  placeholder="Question"
                  value={f.question}
                  onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                />
                <Button type="button" size="sm" variant="ghost" leftIcon="delete" className="text-danger" onClick={() => setFaqs((arr) => arr.filter((_, j) => j !== i))} />
              </div>
              <Textarea
                placeholder="Answer"
                rows={2}
                value={f.answer}
                onChange={(e) => setFaqs((arr) => arr.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">SEO (optional)</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input label="Meta title" value={form.meta_title} onChange={(e) => update("meta_title", e.target.value)} />
          <Textarea label="Meta description" rows={2} value={form.meta_description} onChange={(e) => update("meta_description", e.target.value)} />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Link to="/admin/webinars">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
        <Button type="submit" loading={saving} leftIcon="save">
          {isEdit ? "Save changes" : "Create webinar"}
        </Button>
      </div>
    </form>
  );
}
