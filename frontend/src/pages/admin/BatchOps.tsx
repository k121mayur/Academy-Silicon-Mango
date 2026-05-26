import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
import {
  completeBatch,
  generateCertificates,
  listBatches,
  listCertificates,
} from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function BatchOps() {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState("");
  const [certs, setCerts] = useState<any[]>([]);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listBatches({ limit: 100 }).then((r) => setBatches(r.data));
  }, []);

  const selected = batches.find((b) => b.id === batchId);

  useEffect(() => {
    if (!batchId) return;
    listCertificates(batchId).then(setCerts).catch(() => setCerts([]));
  }, [batchId]);

  const onComplete = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      await completeBatch(batchId);
      toast.success("Batch completed");
      const refreshed = await listBatches({ limit: 100 });
      setBatches(refreshed.data);
      setConfirmComplete(false);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onGenerate = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      const res = await generateCertificates(batchId);
      toast.success(`Created ${res.created} certificates`);
      const list = await listCertificates(batchId);
      setCerts(list);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Batch Operations</h1>
        <p className="text-body-sm text-ink-variant">Complete batches and release certificates</p>
      </div>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Select a batch</p></CardHeader>
        <CardBody>
          <Select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            options={[{ value: "", label: "Select batch" }, ...batches.map((b) => ({ value: b.id, label: `${b.name} — ${b.course_title} (${b.status})` }))]}
          />
          {selected && (
            <div className="mt-4 grid md:grid-cols-3 gap-3 text-body-sm">
              <Stat label="Status" value={selected.status} />
              <Stat label="Enrolled" value={selected.enrolled_count} />
              <Stat label="Locked" value={selected.is_locked ? "Yes" : "No"} />
            </div>
          )}
        </CardBody>
      </Card>

      {selected && (
        <>
          <Card>
            <CardHeader><p className="text-title-md font-semibold">Complete batch</p></CardHeader>
            <CardBody>
              <p className="text-body-sm text-ink-variant mb-3">
                Marking a batch complete will lock it. Inactive batches can still have certificates generated below.
              </p>
              <Button leftIcon="lock" disabled={selected.is_locked} onClick={() => setConfirmComplete(true)}>
                {selected.is_locked ? "Already locked" : "Complete & lock batch"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <p className="text-title-md font-semibold">Certificates</p>
              <Button size="sm" leftIcon="workspace_premium" onClick={onGenerate} loading={busy} disabled={selected.status !== "completed"}>
                Generate for all
              </Button>
            </CardHeader>
            <CardBody className="p-0">
              {selected.status !== "completed" && (
                <p className="p-5 text-body-sm text-ink-outline">Complete the batch first to generate certificates.</p>
              )}
              {certs.length === 0 ? (
                <p className="p-5 text-body-sm text-ink-outline">No certificates generated yet</p>
              ) : (
                <Table>
                  <THead>
                    <tr><TH>Student</TH><TH>Email</TH><TH>Issued</TH><TH>Email status</TH></tr>
                  </THead>
                  <tbody>
                    {certs.map((c) => (
                      <TR key={c.id}>
                        <TD className="font-medium">{c.student_name}</TD>
                        <TD className="text-ink-variant">{c.student_email}</TD>
                        <TD>{formatDate(c.issued_at)}</TD>
                        <TD><Badge tone={c.email_status === "sent" ? "success" : c.email_status === "pending" ? "warning" : "danger"}>{c.email_status}</Badge></TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmModal
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={onComplete}
        title="Complete and lock batch?"
        description="Once locked, edits and enrollments are disabled. You can still generate certificates."
        confirmLabel="Complete batch"
        loading={busy}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-surface-containerLow rounded-xl p-3">
      <p className="text-label text-ink-outline">{label}</p>
      <p className="text-title-md font-semibold text-ink">{String(value)}</p>
    </div>
  );
}
