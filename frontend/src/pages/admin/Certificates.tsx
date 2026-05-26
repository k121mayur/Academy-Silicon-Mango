import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { FileUpload } from "@/components/shared/FileUpload";
import { extractErrorMessage } from "@/lib/api";
import {
  listCertTemplates,
  listCourses,
  uploadCertTemplate,
} from "@/services/admin.service";

export default function AdminCertificates() {
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState("");
  const [template, setTemplate] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState({
    name: { x: 400, y: 320, font_size: 28 },
    course: { x: 400, y: 380, font_size: 20 },
    date: { x: 400, y: 460, font_size: 14 },
  });

  useEffect(() => {
    listCourses({ limit: 100 }).then((r) => setCourses(r.data));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setTemplate(null);
      return;
    }
    listCertTemplates(courseId).then((rows) => {
      setTemplate(rows[0] || null);
      if (rows[0]?.field_config) setConfig({ ...config, ...(rows[0].field_config as any) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const save = async () => {
    if (!courseId || !file) {
      toast.error("Select a course and upload a template PDF/image");
      return;
    }
    setBusy(true);
    try {
      const tmpl = await uploadCertTemplate(courseId, file, config);
      setTemplate(tmpl);
      toast.success("Template saved");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Certificate Templates</h1>
        <p className="text-body-sm text-ink-variant">Configure per-course certificate templates and field positions</p>
      </div>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Course</p></CardHeader>
        <CardBody>
          <Select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={[{ value: "", label: "Select course" }, ...courses.map((c) => ({ value: c.id, label: c.title }))]}
          />
          {template && (
            <div className="mt-3">
              <Badge tone="success">Template configured</Badge>
              {template.template_url && (
                <a href={template.template_url} target="_blank" rel="noreferrer" className="ml-3 text-body-sm text-primary hover:underline">
                  View current template ↗
                </a>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {courseId && (
        <>
          <Card>
            <CardHeader><p className="text-title-md font-semibold">Upload template</p></CardHeader>
            <CardBody>
              <FileUpload
                accept=".pdf,image/*"
                onChange={setFile}
                hint="PDF or image. Final certificate will be generated with this as the background."
                preview={false}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader><p className="text-title-md font-semibold">Field positions (px)</p></CardHeader>
            <CardBody className="grid md:grid-cols-3 gap-3">
              {(["name", "course", "date"] as const).map((field) => (
                <div key={field} className="bg-surface-containerLow rounded-xl p-3 space-y-2">
                  <p className="text-label uppercase tracking-wide text-ink-outline">{field}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input className="border rounded p-1 text-body-sm" type="number" value={(config as any)[field].x}
                      onChange={(e) => setConfig({ ...config, [field]: { ...(config as any)[field], x: parseInt(e.target.value) || 0 } })} placeholder="X" />
                    <input className="border rounded p-1 text-body-sm" type="number" value={(config as any)[field].y}
                      onChange={(e) => setConfig({ ...config, [field]: { ...(config as any)[field], y: parseInt(e.target.value) || 0 } })} placeholder="Y" />
                    <input className="border rounded p-1 text-body-sm" type="number" value={(config as any)[field].font_size}
                      onChange={(e) => setConfig({ ...config, [field]: { ...(config as any)[field], font_size: parseInt(e.target.value) || 0 } })} placeholder="Size" />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save} loading={busy}>Save template</Button>
          </div>
        </>
      )}
    </div>
  );
}
