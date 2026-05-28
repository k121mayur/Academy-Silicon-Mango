import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api";
import {
  fetchDashboard,
  type InstructorDashboardStats,
  type InstructorRecentBatch,
} from "@/services/instructor.service";

export default function InstructorDashboard() {
  const [stats, setStats] = useState<InstructorDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDashboard()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Dashboard</h1>
          <p className="text-body-sm text-ink-variant">
            Workload at a glance — assigned batches, students, sessions, and grading queue.
          </p>
        </div>
        <Link to="/instructor/batches">
          <Button variant="secondary" leftIcon="groups_2">View batches</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon="groups_2" label="Assigned batches" value={stats?.assigned_batches ?? "—"} loading={loading} />
        <SummaryCard icon="school" label="Students" value={stats?.students ?? "—"} loading={loading} />
        <SummaryCard icon="event" label="Sessions" value={stats?.sessions ?? "—"} loading={loading} />
        <SummaryCard
          icon="pending_actions"
          label="Pending grading"
          value={stats?.pending_grading ?? "—"}
          loading={loading}
          tone={stats && stats.pending_grading > 0 ? "warning" : undefined}
        />
      </div>

      {!loading && stats && stats.assigned_batches === 0 && (
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <span className="icon text-primary text-[24px]">info</span>
              <div>
                <p className="font-semibold text-ink mb-1">No batches assigned yet</p>
                <p className="text-body-sm text-ink-variant">
                  An admin must assign you to a course AND a specific batch of that course before
                  anything appears here. This page will populate as soon as that happens.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <BatchList title="Active batches" rows={stats?.active_batches} loading={loading} />
        <BatchList title="Completed batches" rows={stats?.completed_batches} loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <p className="text-title-md font-semibold">Recent batches</p>
          <p className="text-label text-ink-outline">5 most recent — quick links</p>
        </CardHeader>
        <CardBody className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(stats?.recent_batches ?? []).map((b) => (
            <Link
              key={b.id}
              to="/instructor/batches"
              className="block p-4 rounded-xl bg-surface-containerLow hover:bg-surface-container transition-colors"
            >
              <p className="font-semibold text-ink truncate">{b.name}</p>
              <p className="text-label text-ink-outline capitalize">
                {b.delivery_mode} · <span className="capitalize">{b.status}</span>
              </p>
              <p className="text-label text-ink-outline mt-1">
                {b.start_date ?? "?"} → {b.end_date ?? "?"}
              </p>
            </Link>
          ))}
          {!loading && (stats?.recent_batches ?? []).length === 0 && (
            <p className="text-body-sm text-ink-outline col-span-full">No batches yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value, loading, tone }: { icon: string; label: string; value: number | string; loading?: boolean; tone?: "warning" }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          className={`icon text-[28px] grid place-items-center w-12 h-12 rounded-xl ${
            tone === "warning" ? "bg-[#fff1c2] text-[#6b4c00]" : "bg-primary-container/30 text-primary"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-display-sm font-display font-bold text-ink leading-none">{loading ? "…" : value}</p>
          <p className="text-label text-ink-outline mt-1">{label}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function BatchList({ title, rows, loading }: { title: string; rows?: InstructorRecentBatch[]; loading?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <p className="text-title-md font-semibold">{title}</p>
      </CardHeader>
      <CardBody className="space-y-2">
        {loading && <p className="text-body-sm text-ink-outline">Loading…</p>}
        {!loading && (rows ?? []).length === 0 && (
          <p className="text-body-sm text-ink-outline">Nothing here yet.</p>
        )}
        {(rows ?? []).map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-containerLow">
            <div className="min-w-0">
              <p className="font-medium text-ink truncate">{b.name}</p>
              <p className="text-label text-ink-outline">{b.start_date} → {b.end_date}</p>
            </div>
            <Badge tone={b.status === "completed" ? "success" : "primary"}>{b.status}</Badge>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
