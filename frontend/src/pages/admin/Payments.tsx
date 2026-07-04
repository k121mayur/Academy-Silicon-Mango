import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { listPayments, markPaymentPaid } from "@/services/admin.service";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function AdminPayments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    return listPayments({ status: status || undefined })
      .then((res) => setItems(res.data))
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleMarkPaid = async (paymentId: string) => {
    setMarkingId(paymentId);
    try {
      await markPaymentPaid(paymentId);
      toast.success("Payment marked as paid");
      await load();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Payments</h1>
        <p className="text-body-sm text-ink-variant">All transactions across batches</p>
      </div>

      <Select value={status} onChange={(e) => setStatus(e.target.value)} options={[
        { value: "", label: "All status" },
        { value: "paid", label: "Paid" },
        { value: "pending", label: "Pending" },
        { value: "failed", label: "Failed" },
      ]} containerClassName="max-w-xs" />

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No transactions yet" icon="payments" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Student</TH>
              <TH>Batch</TH>
              <TH>Amount</TH>
              <TH>Status</TH>
              <TH>Razorpay Order</TH>
              <TH>Date</TH>
              <TH>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.student_name}</TD>
                <TD>{p.batch_name}</TD>
                <TD className="font-mono">{formatCurrency(p.amount)}</TD>
                <TD><Badge tone={p.status === "paid" ? "success" : p.status === "pending" ? "warning" : "danger"}>{p.status}</Badge></TD>
                <TD className="font-mono text-label">{p.razorpay_order_id || "—"}</TD>
                <TD>{formatDateTime(p.created_at)}</TD>
                <TD>
                  {p.status === "pending" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={markingId === p.id}
                      onClick={() => handleMarkPaid(p.id)}
                    >
                      Mark as Paid
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
