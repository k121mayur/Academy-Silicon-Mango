import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { listPayments } from "@/services/admin.service";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function AdminPayments() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setLoading(true);
    listPayments({ status: status || undefined })
      .then((res) => setItems(res.data))
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [status]);

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
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
