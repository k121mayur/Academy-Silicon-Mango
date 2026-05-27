import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { FileUpload } from "@/components/shared/FileUpload";
import { extractErrorMessage } from "@/lib/api";
import {
  batchEnrollments,
  generateCertificates,
  listBatches,
  listCertTemplates,
  listCourses,
  uploadCertTemplate,
  type BatchDTO,
} from "@/services/admin.service";
import {
  CertificatePreview,
  type CertificateFieldConfig,
} from "@/components/admin/CertificatePreview";

const DEFAULT_CONFIG: CertificateFieldConfig = {
  name: { x: 400, y: 320, font_size: 28, font_color: "#000000", align: "center" },
  course: { x: 400, y: 380, font_size: 20, font_color: "#000000", align: "center" },
  date: { x: 400, y: 460, font_size: 14, font_color: "#000000", align: "center" },
  qr: { x: 800, y: 600, size: 100 },
};

const NAME_MAX_CHARS = 40;

interface EnrolledStudent {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
}

export default function AdminCertificates() {
  const [courses, setCourses] = useState<any[]>([]);
  const [batches, setBatches] = useState<BatchDTO[]>([]);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);

  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [studentId, setStudentId] = useState("");

  const [template, setTemplate] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pendingTemplateType, setPendingTemplateType] = useState<"pdf" | "image" | null>(null);
  const [pendingTemplatePreview, setPendingTemplatePreview] = useState<string | null>(null);

  const [config, setConfig] = useState<CertificateFieldConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    listCourses({ limit: 100 }).then((r) => setCourses(r.data));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setTemplate(null);
      setBatches([]);
      setBatchId("");
      return;
    }
    listCertTemplates(courseId).then((rows) => {
      const t = rows[0] || null;
      setTemplate(t);
      if (t?.field_config) {
        setConfig(mergeConfig(DEFAULT_CONFIG, t.field_config as any));
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    });
    listBatches({ course_id: courseId, limit: 100 }).then((r) => {
      setBatches(r.data);
      setBatchId(r.data[0]?.id ?? "");
    });
    setFile(null);
    setPendingTemplatePreview(null);
    setPendingTemplateType(null);
  }, [courseId]);

  useEffect(() => {
    if (!batchId) {
      setStudents([]);
      setStudentId("");
      return;
    }
    batchEnrollments(batchId).then((rows) => {
      const list = rows as EnrolledStudent[];
      setStudents(list);
      setStudentId(list[0]?.student_id ?? "");
    });
  }, [batchId]);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId]
  );
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId]
  );
  const selectedStudent = useMemo(
    () => students.find((s) => s.student_id === studentId) ?? null,
    [students, studentId]
  );

  const previewTemplateUrl: string | null = pendingTemplatePreview ?? template?.template_url ?? null;
  const previewTemplateType: "pdf" | "image" =
    pendingTemplateType ?? (template?.template_url ? guessTemplateType(template.template_url) : "image");

  const fullStudentName = selectedStudent?.student_name || "Student Name";
  const isTruncated = fullStudentName.length > NAME_MAX_CHARS;
  const displayName = isTruncated
    ? fullStudentName.slice(0, NAME_MAX_CHARS - 1).trimEnd() + "…"
    : fullStudentName;

  const dateStr = selectedBatch?.end_date
    ? formatDate(selectedBatch.end_date)
    : formatDate(new Date().toISOString());

  const handleFileChange = (f: File) => {
    setFile(f);
    if (pendingTemplatePreview) URL.revokeObjectURL(pendingTemplatePreview);
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    setPendingTemplateType(isPdf ? "pdf" : "image");
    setPendingTemplatePreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!courseId) {
      toast.error("Select a course first");
      return;
    }
    if (!file && !template?.template_url) {
      toast.error("Upload a template (PDF or image)");
      return;
    }
    setSaving(true);
    try {
      // If no new file selected, re-upload the existing template URL by fetching it.
      // Simpler: if no file, just save the field_config by re-posting the existing file
      // via a fetch-then-upload roundtrip.
      let toUpload: File | null = file;
      if (!toUpload && template?.template_url) {
        const blob = await fetch(absoluteUrl(template.template_url)).then((r) => r.blob());
        const ext = template.template_url.split(".").pop() || "bin";
        toUpload = new File([blob], `template.${ext}`, { type: blob.type });
      }
      if (!toUpload) {
        toast.error("Upload a template first");
        return;
      }
      const tmpl = await uploadCertTemplate(courseId, toUpload, config as any);
      setTemplate(tmpl);
      setFile(null);
      if (pendingTemplatePreview) {
        URL.revokeObjectURL(pendingTemplatePreview);
        setPendingTemplatePreview(null);
      }
      setPendingTemplateType(null);
      toast.success("Template saved");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!batchId) {
      toast.error("Select a batch first");
      return;
    }
    if (!template) {
      toast.error("Save the template before generating certificates");
      return;
    }
    if (!selectedBatch) return;
    if (selectedBatch.status !== "completed") {
      toast.error("Batch must be marked completed before generating certificates");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateCertificates(batchId);
      toast.success(
        `Created ${result.created} new cert(s); rendered ${(result as any).rendered ?? 0} PDF(s)`
      );
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Certificate Templates</h1>
        <p className="text-body-sm text-ink-variant">
          Configure per-course certificate templates with live preview. Drag fields to position
          them; the preview updates in real time.
        </p>
      </div>

      <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <p className="text-title-md font-semibold">1. Pick course &amp; batch</p>
            </CardHeader>
            <CardBody className="space-y-3">
              <Select
                label="Course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                options={[
                  { value: "", label: "Select course" },
                  ...courses.map((c) => ({ value: c.id, label: c.title })),
                ]}
              />
              {template && (
                <div>
                  <Badge tone="success">Template configured</Badge>
                </div>
              )}
              {courseId && (
                <Select
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  options={[
                    { value: "", label: batches.length ? "Select batch" : "No batches found" },
                    ...batches.map((b) => ({
                      value: b.id,
                      label: `${b.name} (${b.status})`,
                    })),
                  ]}
                />
              )}
              {batchId && (
                <Select
                  label="Preview as student"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  hint="Choose a real enrolled student to preview their certificate."
                  options={[
                    { value: "", label: students.length ? "Select student" : "No enrolled students" },
                    ...students.map((s) => ({ value: s.student_id, label: s.student_name })),
                  ]}
                />
              )}
            </CardBody>
          </Card>

          {courseId && (
            <Card>
              <CardHeader>
                <p className="text-title-md font-semibold">2. Upload template</p>
              </CardHeader>
              <CardBody className="space-y-3">
                <FileUpload
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                  hint="PDF or image. The final certificate uses this as the background."
                  preview={false}
                />
                {template?.template_url && !file && (
                  <a
                    href={absoluteUrl(template.template_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body-sm text-primary hover:underline"
                  >
                    View saved template ↗
                  </a>
                )}
              </CardBody>
            </Card>
          )}

          {courseId && previewTemplateUrl && (
            <Card>
              <CardHeader>
                <p className="text-title-md font-semibold">3. Field positions (px)</p>
              </CardHeader>
              <CardBody className="space-y-3">
                {(["name", "course", "date"] as const).map((field) => {
                  const f = config[field];
                  return (
                    <div
                      key={field}
                      className="bg-surface-containerLow rounded-xl p-3 space-y-2"
                    >
                      <p className="text-label uppercase tracking-wide text-ink-outline">
                        {field}
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <NumberInput
                          label="X"
                          value={f.x}
                          onChange={(v) =>
                            setConfig({ ...config, [field]: { ...f, x: v } })
                          }
                        />
                        <NumberInput
                          label="Y"
                          value={f.y}
                          onChange={(v) =>
                            setConfig({ ...config, [field]: { ...f, y: v } })
                          }
                        />
                        <NumberInput
                          label="Size"
                          value={f.font_size}
                          onChange={(v) =>
                            setConfig({ ...config, [field]: { ...f, font_size: v } })
                          }
                        />
                        <div className="flex flex-col">
                          <label className="text-[10px] uppercase text-ink-outline">Color</label>
                          <input
                            type="color"
                            value={f.font_color ?? "#000000"}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                [field]: { ...f, font_color: e.target.value },
                              })
                            }
                            className="h-8 w-full rounded border border-ink-outlineVariant cursor-pointer"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-ink-outline">Align</label>
                        <select
                          value={f.align ?? "center"}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              [field]: { ...f, align: e.target.value as any },
                            })
                          }
                          className="w-full h-8 border border-ink-outlineVariant rounded px-2 text-body-sm bg-surface-lowest"
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
                <div className="bg-surface-containerLow rounded-xl p-3 space-y-2">
                  <p className="text-label uppercase tracking-wide text-ink-outline">qr code</p>
                  <div className="grid grid-cols-3 gap-2">
                    <NumberInput
                      label="X"
                      value={config.qr.x}
                      onChange={(v) => setConfig({ ...config, qr: { ...config.qr, x: v } })}
                    />
                    <NumberInput
                      label="Y"
                      value={config.qr.y}
                      onChange={(v) => setConfig({ ...config, qr: { ...config.qr, y: v } })}
                    />
                    <NumberInput
                      label="Size"
                      value={config.qr.size}
                      onChange={(v) => setConfig({ ...config, qr: { ...config.qr, size: v } })}
                    />
                  </div>
                </div>
                {isTruncated && (
                  <div className="text-label rounded p-2 bg-[#fff1c2] text-[#6b4c00] border border-primary-container/30">
                    Heads up — "{fullStudentName}" exceeds {NAME_MAX_CHARS} chars and will be
                    truncated on the printed certificate.
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {courseId && (
            <div className="flex gap-2">
              <Button onClick={save} loading={saving} leftIcon="save">
                Save template
              </Button>
              <Button
                variant="tertiary"
                onClick={handleGenerate}
                loading={generating}
                leftIcon="workspace_premium"
                disabled={!template || !batchId}
              >
                Generate for batch
              </Button>
            </div>
          )}
        </div>

        <Card className="lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <CardHeader>
            <p className="text-title-md font-semibold">Live preview</p>
            <p className="text-label text-ink-outline">
              Drag fields to reposition. Changes update instantly — no save required.
            </p>
          </CardHeader>
          <CardBody>
            {!courseId && (
              <p className="text-body-sm text-ink-outline">
                Pick a course to start.
              </p>
            )}
            {courseId && !previewTemplateUrl && (
              <p className="text-body-sm text-ink-outline">
                Upload a template (PDF or image) to see the live preview.
              </p>
            )}
            {courseId && previewTemplateUrl && (
              <CertificatePreview
                templateUrl={previewTemplateUrl}
                templateType={previewTemplateType}
                fieldConfig={config}
                studentName={displayName}
                courseTitle={selectedCourse?.title ?? "Course Name"}
                dateStr={dateStr}
                qrUrl={`${window.location.origin}/verify/sample-preview`}
                onChange={setConfig}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-[10px] uppercase text-ink-outline">{label}</label>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="h-8 border border-ink-outlineVariant rounded px-2 text-body-sm bg-surface-lowest"
      />
    </div>
  );
}

function mergeConfig(base: CertificateFieldConfig, override: Partial<CertificateFieldConfig>): CertificateFieldConfig {
  const out: CertificateFieldConfig = {
    name: { ...base.name, ...(override.name ?? {}) },
    course: { ...base.course, ...(override.course ?? {}) },
    date: { ...base.date, ...(override.date ?? {}) },
    qr: { ...base.qr, ...(override.qr ?? {}) },
  };
  return out;
}

function guessTemplateType(url: string): "pdf" | "image" {
  return url.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
}

function absoluteUrl(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8085";
  return apiBase.replace(/\/api\/v1$/, "") + url;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
