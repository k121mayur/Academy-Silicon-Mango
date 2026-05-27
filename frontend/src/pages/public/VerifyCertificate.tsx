import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyCertificate, type VerifyCertificateResult } from "@/services/admin.service";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function VerifyCertificate() {
  const { certId } = useParams<{ certId: string }>();
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [data, setData] = useState<VerifyCertificateResult | null>(null);

  useEffect(() => {
    if (!certId) {
      setState("invalid");
      return;
    }
    verifyCertificate(certId)
      .then((res) => {
        setData(res);
        setState(res.valid ? "ok" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [certId]);

  return (
    <div className="min-h-screen bg-surface-container py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-display-md text-ink">
            Certificate Verification
          </h1>
          <p className="text-body-sm text-ink-variant">Silicon Mango Academy</p>
        </div>

        <Card>
          <CardHeader>
            {state === "loading" && <p className="text-title-md">Checking certificate…</p>}
            {state === "ok" && (
              <div className="flex items-center gap-2">
                <Badge tone="success" icon="verified">
                  Valid certificate
                </Badge>
              </div>
            )}
            {state === "invalid" && (
              <Badge tone="danger" icon="error">
                Not found or invalid
              </Badge>
            )}
          </CardHeader>
          <CardBody className="space-y-3">
            {state === "loading" && (
              <p className="text-body-sm text-ink-outline">Loading…</p>
            )}
            {state === "invalid" && (
              <p className="text-body-sm text-ink-variant">
                This certificate ID could not be verified. The QR code may have been mistyped or
                the certificate may have been revoked. If you believe this is an error, please
                contact Silicon Mango Academy.
              </p>
            )}
            {state === "ok" && data && (
              <dl className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-4 text-body-sm">
                <dt className="text-ink-outline">Awarded to</dt>
                <dd className="font-semibold text-ink">{data.student_name}</dd>

                <dt className="text-ink-outline">Course</dt>
                <dd className="text-ink">{data.course_title}</dd>

                <dt className="text-ink-outline">Batch</dt>
                <dd className="text-ink">{data.batch_name}</dd>

                <dt className="text-ink-outline">Batch dates</dt>
                <dd className="text-ink">
                  {fmt(data.batch_start)} – {fmt(data.batch_end)}
                </dd>

                <dt className="text-ink-outline">Issued</dt>
                <dd className="text-ink">{fmt(data.issued_at)}</dd>

                <dt className="text-ink-outline">Certificate ID</dt>
                <dd className="text-ink font-mono text-label break-all">{certId}</dd>
              </dl>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function fmt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
