import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import { getStudent } from "@/services/admin.service";
import { formatDate } from "@/lib/utils";

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    getStudent(id)
      .then(setStudent)
      .catch((e) => toast.error(extractErrorMessage(e)));
  }, [id]);

  if (!student) return <p className="text-body-sm text-ink-outline">Loading…</p>;

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={() => navigate("/admin/users/students")} className="text-body-sm text-ink-outline hover:text-ink inline-flex items-center gap-1">
        <span className="icon text-[16px]">arrow_back</span> Students
      </button>

      <Card>
        <CardBody className="flex items-start gap-5">
          <Avatar name={student.display_name} src={student.avatar_url} size="lg" />
          <div className="flex-1">
            <h1 className="font-display font-bold text-headline text-ink">{student.display_name}</h1>
            <p className="text-body-sm text-ink-variant">{student.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge tone={student.profile_complete ? "success" : "warning"}>{student.profile_complete ? "Profile complete" : "Profile incomplete"}</Badge>
              <Badge tone="neutral">{student.auth_provider}</Badge>
              <Badge tone={student.is_active ? "success" : "danger"}>{student.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><p className="text-title-md font-semibold">Contact</p></CardHeader>
          <CardBody className="space-y-1 text-body-sm">
            <Row label="Phone" value={student.phone || "—"} />
            <Row label="City" value={student.city || "—"} />
            <Row label="Joined" value={formatDate(student.created_at)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader><p className="text-title-md font-semibold">Profile</p></CardHeader>
          <CardBody className="space-y-1 text-body-sm">
            <Row label="Occupation" value={student.occupation || "—"} />
            <Row label="Education entries" value={student.education?.length ?? 0} />
            <Row label="Experience entries" value={student.experience?.length ?? 0} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between py-1 border-b border-ink-outlineVariant/30 last:border-0">
      <span className="text-ink-variant">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}
