import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api";
import { changePassword } from "@/services/instructor.service";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!current) return toast.error("Current password is required");
    if (!next) return toast.error("New password is required");
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next))
      return toast.error("Password must contain at least one letter and one digit");
    if (next === current) return toast.error("New password must be different from current");
    if (next !== confirm) return toast.error("New passwords do not match");

    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => navigate(-1), 800);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Change password</h1>
          <p className="text-body-sm text-ink-variant">
            For security, change your password after first login. Must be at least 8 characters and
            include a letter and a digit.
          </p>
        </div>

        <Card>
          <CardHeader>
            <p className="text-title-md font-semibold">New password</p>
          </CardHeader>
          <CardBody className="space-y-3">
            <Input
              label="Current password *"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
            <Input
              label="New password *"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              hint="Min 8 characters, including a letter and a digit"
            />
            <Input
              label="Confirm new password *"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </CardBody>
          <div className="p-5 border-t border-ink-outlineVariant/30 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button onClick={submit} loading={saving} leftIcon="save">Change password</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
