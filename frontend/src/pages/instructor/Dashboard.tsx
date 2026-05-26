import { useAuthStore } from "@/features/auth/stores/authStore";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";

export default function InstructorDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-display-md text-ink">Hi {user?.display_name || user?.email}</h1>
            <p className="text-body-sm text-ink-variant">Instructor dashboard</p>
          </div>
          <Button variant="ghost" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}>Sign out</Button>
        </div>
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-variant">
              Welcome instructor. Sessions, attendance, and grading tools will appear here as features roll out.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
