import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SubmitModal } from "@/components/student/SubmitModal";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { absoluteApiUrl } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import {
  fetchBatchAssignments,
  fetchBatchAttendance,
  fetchBatchProgress,
  fetchBatchSessions,
  fetchMyBatches,
  fetchMyCertificates,
  type StudentAssignment,
  type StudentResource,
  type StudentSession,
} from "@/services/student.service";

const STATUS_TONE: Record<string, "neutral" | "primary" | "success" | "warning"> = {
  graded: "success",
  submitted: "primary",
  late: "warning",
  missing: "neutral",
};

function submissionLabel(a: StudentAssignment): { label: string; tone: "neutral" | "primary" | "success" | "warning" } {
  if (!a.submission) return { label: "Not started", tone: "neutral" };
  const s = a.submission.status;
  return { label: s.charAt(0).toUpperCase() + s.slice(1), tone: STATUS_TONE[s] ?? "primary" };
}

export default function BatchWorkspace() {
  const { batchId = "" } = useParams();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState<StudentAssignment | null>(null);

  const batchesQ = useQuery({ queryKey: qk.student.batches(), queryFn: fetchMyBatches });
  const batch = (batchesQ.data ?? []).find((b) => b.id === batchId);

  const sessionsQ = useQuery({
    queryKey: qk.student.sessions(batchId),
    queryFn: () => fetchBatchSessions(batchId),
    enabled: !!batchId,
  });
  const assignmentsQ = useQuery({
    queryKey: qk.student.assignments(batchId),
    queryFn: () => fetchBatchAssignments(batchId),
    enabled: !!batchId,
  });
  const progressQ = useQuery({
    queryKey: qk.student.progress(batchId),
    queryFn: () => fetchBatchProgress(batchId),
    enabled: !!batchId,
  });
  const attendanceQ = useQuery({
    queryKey: qk.student.attendance(batchId),
    queryFn: () => fetchBatchAttendance(batchId),
    enabled: !!batchId,
  });
  const certsQ = useQuery({ queryKey: qk.student.certificates(), queryFn: fetchMyCertificates });

  const sessions = sessionsQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];
  const progress = progressQ.data;

  const nextLive = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter((s) => s.status === "scheduled" && s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0];
  }, [sessions]);

  const recentResources = useMemo(() => {
    const flat: { res: StudentResource; session: StudentSession }[] = [];
    [...sessions]
      .sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return tb - ta;
      })
      .forEach((s) => s.resources.forEach((res) => flat.push({ res, session: s })));
    return flat.slice(0, 6);
  }, [sessions]);

  const cert = (certsQ.data ?? []).find((c) => batch && c.batch_name === batch.name);

  const reloadAssignments = () => queryClient.invalidateQueries({ queryKey: qk.student.assignments(batchId) });

  if (batchesQ.isError) {
    return <QueryErrorState error={batchesQ.error} onRetry={() => batchesQ.refetch()} />;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <nav className="text-label text-ink-outline flex items-center gap-1.5 animate-fade-in">
        <Link to={ROUTES.student.myCourses} className="hover:text-primary">
          My Courses
        </Link>
        <span className="icon text-[14px]">chevron_right</span>
        <span className="text-ink-variant truncate max-w-[50vw]">{batch?.course_title ?? "Course"}</span>
      </nav>

      {/* Header */}
      <div className="animate-slide-up flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">{batch?.course_title ?? "Course"}</h1>
          <p className="text-body-sm text-ink-variant">
            {batch?.name}
            {batch?.start_date && batch?.end_date && (
              <>
                {" · "}
                {formatDate(batch.start_date)} → {formatDate(batch.end_date)}
              </>
            )}
          </p>
        </div>
        {batch?.delivery_mode === "recorded" && (
          <Button leftIcon="play_circle" onClick={() => navigate(ROUTES.student.selfPaced(batchId))}>
            Open lessons
          </Button>
        )}
      </div>

      {/* Next live session highlight */}
      {nextLive && (
        <Card className="border-primary/30 bg-primary-container/15 animate-slide-up">
          <CardBody className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <span className="icon text-[28px] text-primary mt-0.5">sensors</span>
              <div>
                <p className="text-label text-primary-onContainer font-semibold uppercase tracking-wide">
                  Next live session
                </p>
                <p className="font-display font-semibold text-title-md text-ink mt-0.5">{nextLive.title}</p>
                <p className="text-body-sm text-ink-variant">
                  {nextLive.scheduled_at ? formatDateTime(nextLive.scheduled_at) : "—"} ·{" "}
                  {nextLive.scheduled_at ? relativeTime(nextLive.scheduled_at) : ""} · {nextLive.duration_mins} mins
                </p>
              </div>
            </div>
            {nextLive.meeting_link && (
              <a href={nextLive.meeting_link} target="_blank" rel="noreferrer">
                <Button leftIcon="videocam">Join meeting</Button>
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {/* Progress + attendance */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <p className="text-title-md font-semibold">Your progress</p>
          </CardHeader>
          <CardBody>
            {progressQ.isLoading ? (
              <div className="h-20 bg-surface-container rounded animate-pulse" />
            ) : progress ? (
              <>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-label text-ink-variant">Overall</span>
                  <span className="text-label font-semibold text-primary">{progress.overall_percent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${progress.overall_percent}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                  <Metric label="Sessions" value={`${progress.sessions.done}/${progress.sessions.total}`} icon="event" />
                  <Metric
                    label="Graded"
                    value={`${progress.assignments.graded}/${progress.assignments.total}`}
                    icon="assignment_turned_in"
                  />
                  <Metric
                    label="Attended"
                    value={`${progress.attendance.present}/${progress.attendance.total}`}
                    icon="fact_check"
                  />
                </div>
              </>
            ) : (
              <p className="text-body-sm text-ink-outline">Progress will appear as sessions run.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-title-md font-semibold">Attendance</p>
          </CardHeader>
          <CardBody>
            {attendanceQ.isLoading ? (
              <div className="h-20 bg-surface-container rounded animate-pulse" />
            ) : (attendanceQ.data ?? []).length === 0 ? (
              <p className="text-body-sm text-ink-outline">No attendance recorded yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {(attendanceQ.data ?? []).map((a) => (
                  <div key={a.session_id} className="flex items-center justify-between gap-2 text-body-sm">
                    <span className="text-ink truncate">{a.session_title}</span>
                    <Badge
                      tone={
                        a.status === "present"
                          ? "success"
                          : a.status === "absent"
                          ? "danger"
                          : a.status === "late"
                          ? "warning"
                          : "neutral"
                      }
                    >
                      {a.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Certificate */}
      {cert && (
        <Card className="border-success/30 bg-success-container/20">
          <CardBody className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="icon text-[28px] text-success">workspace_premium</span>
              <div>
                <p className="font-display font-semibold text-title-md text-ink">Your certificate is ready</p>
                <p className="text-body-sm text-ink-variant">
                  {cert.course_title} · issued {cert.issued_at?.slice(0, 10)}
                </p>
              </div>
            </div>
            {cert.pdf_url && (
              <a href={absoluteApiUrl(cert.pdf_url)} target="_blank" rel="noreferrer">
                <Button leftIcon="download">Download certificate</Button>
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {/* Recently uploaded resources */}
      {recentResources.length > 0 && (
        <Card>
          <CardHeader>
            <p className="text-title-md font-semibold">Recent resources</p>
          </CardHeader>
          <CardBody className="grid sm:grid-cols-2 gap-2">
            {recentResources.map(({ res, session }) => (
              <ResourceRow key={res.id} res={res} sessionTitle={session.title} batchId={batchId} />
            ))}
          </CardBody>
        </Card>
      )}

      {/* Assignments */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-title-md font-semibold">Assignments</p>
          <p className="text-label text-ink-outline">{assignments.length} total</p>
        </CardHeader>
        <CardBody className="space-y-2">
          {assignmentsQ.isLoading ? (
            <div className="h-16 bg-surface-container rounded animate-pulse" />
          ) : assignments.length === 0 ? (
            <p className="text-body-sm text-ink-outline">No assignments yet.</p>
          ) : (
            assignments.map((a) => {
              const status = submissionLabel(a);
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 p-3 bg-surface-containerLow rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-ink truncate">{a.title}</p>
                      <Badge tone="neutral">{a.assignment_type.replace(/_/g, " ")}</Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    {a.description && (
                      <p className="text-body-sm text-ink-variant mt-1 whitespace-pre-wrap line-clamp-2">
                        {a.description}
                      </p>
                    )}
                    <p className="text-label text-ink-outline mt-1">
                      {a.due_date ? `Due ${formatDateTime(a.due_date)}` : "No due date"}
                      {a.max_points !== null && ` · ${a.max_points} pts`}
                      {a.allow_late && " · late allowed"}
                    </p>
                    {a.submission && (
                      <div className="mt-2 text-body-sm text-ink-variant">
                        {a.submission.score !== null && (
                          <p>
                            Score:{" "}
                            <strong>
                              {a.submission.score}
                              {a.max_points ? `/${a.max_points}` : ""}
                            </strong>
                          </p>
                        )}
                        {a.submission.feedback && <p className="mt-1 italic">"{a.submission.feedback}"</p>}
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => setSubmitting(a)}>
                    {a.submission ? "Resubmit" : "Submit"}
                  </Button>
                </div>
              );
            })
          )}
        </CardBody>
      </Card>

      {submitting && (
        <SubmitModal
          assignment={submitting}
          onClose={() => setSubmitting(null)}
          onSubmitted={() => {
            setSubmitting(null);
            reloadAssignments();
            queryClient.invalidateQueries({ queryKey: qk.student.progress(batchId) });
            toast.success("Submitted");
          }}
        />
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-surface-containerLow rounded-lg py-2">
      <span className="icon text-[18px] text-ink-outline">{icon}</span>
      <p className="text-body-sm font-semibold text-ink leading-tight">{value}</p>
      <p className="text-caption text-ink-outline">{label}</p>
    </div>
  );
}

function ResourceRow({
  res,
  sessionTitle,
  batchId,
}: {
  res: StudentResource;
  sessionTitle: string;
  batchId: string;
}) {
  const navigate = useNavigate();
  const isVideo = res.resource_type === "video";
  const icon = isVideo ? "play_circle" : res.resource_type === "link" ? "link" : "description";

  const onClick = () => {
    if (isVideo) {
      navigate(ROUTES.student.selfPaced(batchId));
    } else {
      const url = (res as { url: string }).url;
      window.open(res.resource_type === "link" ? url : absoluteApiUrl(url), "_blank");
    }
  };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-surface-containerLow rounded-lg hover:bg-surface-container text-left transition-colors"
    >
      <span className="icon text-[20px] text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink truncate">{res.title}</p>
        <p className="text-label text-ink-outline truncate">{sessionTitle}</p>
      </div>
    </button>
  );
}
