import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { extractErrorMessage } from "@/lib/api";
import {
  completeBatch,
  generateCertificates,
  listBatches,
  listBatchEmailCampaigns,
  listCertificates,
  sendBatchEmail,
  BatchEmailCampaign,
} from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function BatchOps() {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState("");
  const [certs, setCerts] = useState<any[]>([]);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [confirmSendEmail, setConfirmSendEmail] = useState(false);
  const [campaigns, setCampaigns] = useState<BatchEmailCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  useEffect(() => {
    listBatches({ limit: 100 }).then((r) => setBatches(r.data));
  }, []);

  const selected = batches.find((b) => b.id === batchId);

  useEffect(() => {
    if (!batchId) return;
    listCertificates(batchId).then(setCerts).catch(() => setCerts([]));
  }, [batchId]);

  const refreshCampaigns = () => {
    if (!batchId) return;
    setLoadingCampaigns(true);
    listBatchEmailCampaigns(batchId)
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setLoadingCampaigns(false));
  };

  useEffect(() => {
    setEmailSubject("");
    setEmailBody("");
    if (!batchId) {
      setCampaigns([]);
      return;
    }
    refreshCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const onSendEmail = async () => {
    if (!batchId || !emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      const res = await sendBatchEmail(batchId, { subject: emailSubject.trim(), body: emailBody.trim() });
      toast.success(`Queued for ${res.total_recipients} student(s)`);
      setEmailSubject("");
      setEmailBody("");
      setConfirmSendEmail(false);
      refreshCampaigns();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to send email"));
    } finally {
      setSendingEmail(false);
    }
  };

  const onComplete = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      const result = await completeBatch(batchId);
      const c = result.certificates;
      if (c.template_missing) {
        toast.error("Batch completed but no certificate template — upload one to email certs");
      } else if (c.emailed > 0 && c.failed === 0) {
        toast.success(`Batch completed — ${c.emailed} certificate(s) emailed`);
      } else if (c.emailed > 0 && c.failed > 0) {
        toast.success(`Batch completed — ${c.emailed} emailed, ${c.failed} failed`);
      } else if (c.failed > 0) {
        toast.error(`Batch completed but all ${c.failed} certificate emails failed`);
      } else {
        toast.success("Batch completed (no enrollments to certify)");
      }
      const refreshed = await listBatches({ limit: 100 });
      setBatches(refreshed.data);
      const list = await listCertificates(batchId);
      setCerts(list);
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
      if (res.failed > 0) {
        toast.success(`Emailed ${res.emailed} certificate(s), ${res.failed} failed`);
      } else {
        toast.success(`Emailed ${res.emailed} certificate(s)`);
      }
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
            <CardHeader><p className="text-title-md font-semibold">Send email to batch</p></CardHeader>
            <CardBody>
              <p className="text-body-sm text-ink-variant mb-3">
                Send a bulk email to all {selected.enrolled_count} student(s) enrolled in "{selected.name}".
              </p>
              <div className="space-y-3">
                <Input
                  label="Subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. Important update about your batch"
                />
                <Textarea
                  label="Message"
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Write the email body here…"
                />
                <Button
                  leftIcon="send"
                  onClick={() => setConfirmSendEmail(true)}
                  disabled={!emailSubject.trim() || !emailBody.trim() || selected.enrolled_count === 0}
                >
                  Send email
                </Button>
              </div>

              {campaigns.length > 0 && (
                <div className="mt-5 border-t border-ink-outlineVariant/40 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-label text-ink-outline font-medium">Recent campaigns</p>
                    <Button size="sm" variant="ghost" leftIcon="refresh" onClick={refreshCampaigns} loading={loadingCampaigns} />
                  </div>
                  <div className="space-y-2">
                    {campaigns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-surface-containerLow rounded-lg px-3 py-2 text-body-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate">{c.subject}</p>
                          <p className="text-label text-ink-outline">{formatDate(c.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-label text-ink-variant">{c.sent_count}/{c.total_recipients}</span>
                          <Badge tone={c.status === "sent" ? "success" : c.status === "failed" ? "danger" : "warning"}>{c.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <p className="text-title-md font-semibold">Certificates</p>
              <Button size="sm" leftIcon="workspace_premium" onClick={onGenerate} loading={busy} disabled={selected.status !== "completed"}>
                Generate & email all
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
        title="Complete batch and email certificates?"
        description="The batch will be locked, and certificates will be rendered + emailed immediately to every enrolled student. A certificate template must be uploaded for this course."
        confirmLabel="Complete & email"
        loading={busy}
      />

      <ConfirmModal
        open={confirmSendEmail}
        onClose={() => setConfirmSendEmail(false)}
        onConfirm={onSendEmail}
        title="Send email to all enrolled students?"
        description={`This sends "${emailSubject}" to ${selected?.enrolled_count ?? 0} student(s) enrolled in "${selected?.name ?? ""}". This cannot be recalled once sent.`}
        confirmLabel="Send email"
        loading={sendingEmail}
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
