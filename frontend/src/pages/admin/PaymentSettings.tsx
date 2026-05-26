import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { getPaymentSettings, updatePaymentSettings } from "@/services/admin.service";

export default function PaymentSettings() {
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState("test");
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await getPaymentSettings();
      setData(res);
      setMode(res.mode);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!keyId || !keySecret) {
      toast.error("Both keys are required");
      return;
    }
    setBusy(true);
    try {
      await updatePaymentSettings({ mode, key_id: keyId, key_secret: keySecret });
      toast.success("Payment settings saved");
      setEditing(false);
      setKeyId("");
      setKeySecret("");
      load();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Payment Settings</h1>
        <p className="text-body-sm text-ink-variant">Razorpay credentials. Stored securely.</p>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-title-md font-semibold">Razorpay configuration</p>
          {!editing && data?.has_credentials && <Badge tone="success">Configured</Badge>}
        </CardHeader>
        <CardBody className="space-y-4">
          <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value)} options={[
            { value: "test", label: "Test" },
            { value: "live", label: "Live" },
          ]} />

          {!editing ? (
            <>
              <div>
                <p className="text-label text-ink-outline">Current Key ID</p>
                <p className="font-mono text-body-sm text-ink">{data?.key_id_masked || "Not set"}</p>
              </div>
              <Button variant="outline" leftIcon="edit" onClick={() => setEditing(true)}>Update credentials</Button>
            </>
          ) : (
            <>
              <Input label="Key ID" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_xxxxxxxx" />
              <Input label="Key Secret" type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="xxxxxxxxxxxx" />
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
                <Button onClick={save} loading={busy}>Save</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
