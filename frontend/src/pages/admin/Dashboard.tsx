import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate, relativeTime } from "@/lib/utils";
import {
  fetchDashboardStats,
  fetchRecentTransactions,
  fetchRevenueChart,
  fetchUpcomingSessions,
} from "@/services/admin.service";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface Stats {
  total_revenue: number;
  this_month_revenue: number;
  mom_change_percent: number | null;
  active_students: number;
  total_courses: number;
  total_batches: number;
  total_instructors: number;
  total_students: number;
  pending_grading: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<{ date: string; amount: number }[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch((e) => console.error("[DASH] stats fail", e));
    fetchRevenueChart(30).then(setChart).catch((e) => console.error("[DASH] chart fail", e));
    fetchRecentTransactions().then(setTxs).catch((e) => console.error("[DASH] tx fail", e));
    fetchUpcomingSessions().then(setSessions).catch((e) => console.error("[DASH] sessions fail", e));
  }, []);

  const cards = [
    {
      label: "Total Revenue",
      value: formatCurrency(stats?.total_revenue || 0),
      icon: "payments",
      tone: "primary" as const,
      hint:
        stats?.mom_change_percent != null
          ? `${stats.mom_change_percent >= 0 ? "+" : ""}${stats.mom_change_percent.toFixed(1)}% MoM`
          : "MoM data pending",
    },
    { label: "Active Students", value: stats?.active_students ?? 0, icon: "school", tone: "tertiary" as const, hint: `${stats?.total_students ?? 0} total` },
    { label: "Courses", value: stats?.total_courses ?? 0, icon: "menu_book", tone: "secondary" as const, hint: `${stats?.total_batches ?? 0} batches` },
    { label: "Pending Grading", value: stats?.pending_grading ?? 0, icon: "assignment_turned_in", tone: "neutral" as const, hint: "Coming soon" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Dashboard</h1>
        <p className="text-body-sm text-ink-variant">Quick overview of your academy</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardBody className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl grid place-items-center ${
                c.tone === "primary" ? "bg-primary-container/30 text-primary-onContainer"
                : c.tone === "tertiary" ? "bg-tertiary-container/30 text-tertiary"
                : c.tone === "secondary" ? "bg-secondary-container text-secondary"
                : "bg-surface-container text-ink-variant"
              }`}>
                <span className="icon">{c.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-label uppercase tracking-wide text-ink-outline">{c.label}</p>
                <p className="font-display font-bold text-display-md text-ink truncate">{c.value}</p>
                <p className="text-label text-ink-outline">{c.hint}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <p className="font-display font-semibold text-title-md text-ink">Revenue (30 days)</p>
          </CardHeader>
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid stroke="#edeeef" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#837560" }} tickFormatter={(v) => formatDate(v, { day: "2-digit", month: "short" })} />
                  <YAxis tick={{ fontSize: 11, fill: "#837560" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #d5c4ab", fontSize: 12 }}
                    formatter={(v: number) => formatCurrency(v)}
                    labelFormatter={(l) => formatDate(l)}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#7c5800" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="font-display font-semibold text-title-md text-ink">Upcoming Sessions</p>
          </CardHeader>
          <CardBody className="p-0">
            {sessions.length === 0 ? (
              <p className="p-5 text-body-sm text-ink-outline">No sessions scheduled.</p>
            ) : (
              <ul className="divide-y divide-ink-outlineVariant/30">
                {sessions.slice(0, 6).map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <p className="text-body-sm font-medium text-ink truncate">{s.title}</p>
                    <p className="text-label text-ink-outline truncate">{s.batch_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge tone={s.session_type === "live" ? "primary" : "neutral"}>{s.session_type}</Badge>
                      <span className="text-label text-ink-outline">{relativeTime(s.scheduled_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <p className="font-display font-semibold text-title-md text-ink">Recent Transactions</p>
        </CardHeader>
        <CardBody className="p-0">
          {txs.length === 0 ? (
            <p className="p-5 text-body-sm text-ink-outline">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-ink-outlineVariant/30">
              {txs.map((t) => (
                <li key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink truncate">{t.student_email}</p>
                    <p className="text-label text-ink-outline truncate">{t.batch_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={t.status === "paid" ? "success" : t.status === "pending" ? "warning" : "danger"}>{t.status}</Badge>
                    <p className="font-mono text-body-sm font-semibold text-ink">{formatCurrency(t.amount)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
