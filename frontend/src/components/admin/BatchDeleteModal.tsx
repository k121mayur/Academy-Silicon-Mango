import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api";
import { BatchDeleteImpact, deleteBatch, getBatchDeleteImpact } from "@/services/admin.service";
import { formatCurrency } from "@/lib/utils";

interface Props {
  /** Batch to delete, or null when closed. */
  batch: { id: string; name: string } | null;
  onClose: () => void;
  /** Called after a successful delete. */
  onDeleted: () => void;
}

/**
 * Irreversible batch-wipe confirmation. Loads a delete-impact preview and
 * requires the admin to type the batch name exactly before the delete enables —
 * so it can never happen by accident.
 */
export function BatchDeleteModal({ batch, onClose, onDeleted }: Props) {
  const [impact, setImpact] = useState<BatchDeleteImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!batch) return;
    setImpact(null);
    setConfirmText("");
    setLoadingImpact(true);
    getBatchDeleteImpact(batch.id)
      .then(setImpact)
      .catch((e) => toast.error(extractErrorMessage(e, "Failed to load delete impact")))
      .finally(() => setLoadingImpact(false));
  }, [batch]);

  const nameMatches = !!batch && confirmText.trim() === batch.name;

  const doDelete = async () => {
    if (!batch || !nameMatches) return;
    setDeleting(true);
    try {
      await deleteBatch(batch.id);
      toast.success(`Batch "${batch.name}" deleted`);
      onDeleted();
      onClose();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to delete batch"));
    } finally {
      setDeleting(false);
    }
  };

  const rows: { label: string; value: string | number }[] = impact
    ? [
        { label: "Enrollments removed", value: impact.enrollments },
        { label: "Payment records removed", value: impact.payments_count },
        { label: "Revenue removed from totals", value: formatCurrency(impact.payments_total) },
        { label: "Certificates removed", value: impact.certificates },
        { label: "Sessions removed", value: impact.sessions },
        { label: "Videos removed", value: impact.videos },
      ]
    : [];

  return (
    <Modal
      open={!!batch}
      onClose={onClose}
      title={batch ? `Delete batch "${batch.name}"` : ""}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={doDelete} disabled={!nameMatches || loadingImpact} loading={deleting}>
            Delete batch permanently
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-danger-container/30 border border-danger/20 p-3">
          <p className="text-body-sm text-ink">
            This <strong>permanently deletes</strong> the batch and everything under it. Student accounts are
            kept, but their enrollment in this batch, its payments, sessions, recordings and certificates are
            gone for good. This cannot be undone.
          </p>
        </div>

        {loadingImpact ? (
          <p className="text-body-sm text-ink-outline">Calculating impact…</p>
        ) : impact ? (
          <div className="rounded-lg border border-ink-outlineVariant/40 overflow-hidden">
            {rows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between px-3 py-2 text-body-sm border-b last:border-b-0 border-ink-outlineVariant/20"
              >
                <span className="text-ink-variant">{r.label}</span>
                <span className="font-semibold text-ink">{r.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {impact && impact.payments_total > 0 && (
          <p className="text-label text-[#6b4c00]">
            ⚠ Deleting this batch will reduce your dashboard's total revenue by{" "}
            {formatCurrency(impact.payments_total)}.
          </p>
        )}

        <Input
          label={`Type the batch name to confirm: ${batch?.name ?? ""}`}
          placeholder={batch?.name ?? ""}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
        />
      </div>
    </Modal>
  );
}
