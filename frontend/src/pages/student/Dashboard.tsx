import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SubmitModal } from "@/components/student/SubmitModal";
import { absoluteApiUrl, extractErrorMessage } from "@/lib/api";
import {
  fetchBatchAssignments,
  fetchBatchSessions,
  fetchMyBatches,
  fetchMyCertificates,
  type StudentAssignment,
  type StudentBatch,
  type StudentCertificate,
  type StudentSession,
} from "@/services/student.service";

export default function StudentDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>("");
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [certs, setCerts] = useState<StudentCertificate[]>([]);
  const [submitting, setSubmitting] = useState<StudentAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [bs, cs] = await Promise.all([fetchMyBatches(), fetchMyCertificates()]);
        setBatches(bs);
        setCerts(cs);
        if (bs.length > 0 && !activeBatchId) setActiveBatchId(bs[0].id);
      } catch (e) {
        toast.error(extractErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeBatchId) {
      setSessions([]);
      setAssignments([]);
      return;
    }
    (async () => {
      try {
        const [ss, as] = await Promise.all([
          fetchBatchSessions(activeBatchId),
          fetchBatchAssignments(activeBatchId),
        ]);
        setSessions(ss);
        setAssignments(as);
      } catch (e) {
        toast.error(extractErrorMessage(e));
      }
    })();
  }, [activeBatchId]);

  const reloadAssignments = async () => {
    if (!activeBatchId) return;
    const as = await fetchBatchAssignments(activeBatchId);
    setAssignments(as);
  };

  const activeBatch = batches.find((b) => b.id === activeBatchId);

  return (
    <div className="min-h-screen bg-surface">
      <header className="h-16 bg-surface-lowest border-b border-ink-outlineVariant/40 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/Logo1.png" alt="Silicon Mango" className="w-9 h-9 object-contain" />
          <div className="leading-tight">
            <p className="font-display font-extrabold text-title-md text-ink">Silicon Mango</p>
            <p className="text-label text-ink-outline">Student Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-ink-variant hidden sm:inline">
            {user?.display_name || user?.email}
          </span>
          <Button size="sm" variant="ghost" onClick={() => navigate("/account/change-password")}>
            Change password
          </Button>
          <Button size="sm" variant="ghost" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">My learning</h1>
          <p className="text-body-sm text-ink-variant">Hi {user?.display_name || "there"} — here are your enrolled batches.</p>
        </div>

        {loading && <p className="text-body-sm text-ink-outline">Loading…</p>}

        {!loading && batches.length === 0 && (
          <Card>
            <CardBody>
              <p className="text-body-sm text-ink-variant">
                You aren't enrolled in any batch yet. An admin will enroll you and your courses will appear here.
              </p>
            </CardBody>
          </Card>
        )}

        {batches.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {batches.map((b) => {
              const isSelfPaced = b.delivery_mode === "recorded";
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    if (isSelfPaced) {
                      navigate(`/portal/courses/${b.id}`);
                    } else {
                      setActiveBatchId(b.id);
                    }
                  }}
                  className={`text-left p-4 rounded-xl transition-all ${
                    !isSelfPaced && b.id === activeBatchId
                      ? "bg-primary-container/30 ring-2 ring-primary"
                      : "bg-surface-lowest hover:bg-surface-containerLow border border-ink-outlineVariant/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink truncate">{b.course_title}</p>
                    <Badge tone={b.enrollment_status === "completed" ? "success" : "primary"}>
                      {b.enrollment_status}
                    </Badge>
                  </div>
                  <p className="text-label text-ink-outline">{b.name}</p>
                  <p className="text-label text-ink-outline mt-1">
                    {b.start_date} → {b.end_date} · {b.delivery_mode}
                  </p>
                  {b.instructor_name && (
                    <p className="text-label text-ink-outline mt-1">Instructor: {b.instructor_name}</p>
                  )}
                  {isSelfPaced && (
                    <p className="mt-2 inline-flex items-center gap-1 text-label text-primary">
                      <span className="icon text-[14px]">play_circle</span>
                      Open lessons
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeBatch && (
          <>
            <Card>
              <CardHeader>
                <p className="text-title-md font-semibold">Assignments</p>
                <p className="text-label text-ink-outline">{assignments.length} total</p>
              </CardHeader>
              <CardBody className="space-y-2">
                {assignments.length === 0 && (
                  <p className="text-body-sm text-ink-outline">No assignments yet.</p>
                )}
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 p-3 bg-surface-containerLow rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-ink truncate">{a.title}</p>
                        <Badge tone="neutral">{a.assignment_type.replace("_", " ")}</Badge>
                        {a.submission?.status && (
                          <Badge
                            tone={
                              a.submission.status === "graded"
                                ? "success"
                                : a.submission.status === "late"
                                ? "warning"
                                : "primary"
                            }
                          >
                            {a.submission.status}
                          </Badge>
                        )}
                      </div>
                      {a.description && <p className="text-body-sm text-ink-variant mt-1 whitespace-pre-wrap">{a.description}</p>}
                      <p className="text-label text-ink-outline mt-1">
                        {a.due_date ? `Due ${new Date(a.due_date).toLocaleString()}` : "No due date"}
                        {a.max_points !== null && ` · ${a.max_points} pts`}
                        {a.allow_late && " · late allowed"}
                      </p>
                      {a.submission && (
                        <div className="mt-2 text-body-sm text-ink-variant">
                          {a.submission.score !== null && (
                            <p>
                              Score: <strong>{a.submission.score}{a.max_points ? `/${a.max_points}` : ""}</strong>
                            </p>
                          )}
                          {a.submission.feedback && (
                            <p className="mt-1 italic">"{a.submission.feedback}"</p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={() => setSubmitting(a)}>
                      {a.submission ? "Resubmit" : "Submit"}
                    </Button>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <p className="text-title-md font-semibold">Sessions</p>
                <p className="text-label text-ink-outline">{sessions.length} sessions</p>
              </CardHeader>
              <CardBody className="space-y-2">
                {sessions.length === 0 && (
                  <p className="text-body-sm text-ink-outline">No sessions scheduled.</p>
                )}
                {sessions.slice(0, 10).map((s) => (
                  <div key={s.id} className="p-3 bg-surface-containerLow rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink truncate">{s.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge tone="neutral">{s.session_type}</Badge>
                        <Badge tone={s.status === "completed" ? "success" : s.status === "cancelled" ? "danger" : "primary"}>
                          {s.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-label text-ink-outline">
                      {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "—"} · {s.duration_mins} mins
                    </p>
                    {s.meeting_link && (
                      <a href={s.meeting_link} target="_blank" rel="noreferrer" className="text-body-sm text-primary hover:underline">
                        Join meeting ↗
                      </a>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          </>
        )}

        {certs.length > 0 && (
          <Card>
            <CardHeader>
              <p className="text-title-md font-semibold">Certificates</p>
            </CardHeader>
            <CardBody className="space-y-2">
              {certs.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-3 bg-surface-containerLow rounded-lg">
                  <div>
                    <p className="font-medium text-ink">{c.course_title}</p>
                    <p className="text-label text-ink-outline">{c.batch_name} · issued {c.issued_at?.slice(0, 10)}</p>
                  </div>
                  {c.pdf_url && (
                    <a href={absoluteApiUrl(c.pdf_url)} target="_blank" rel="noreferrer">
                      <Button size="sm" leftIcon="download">Download PDF</Button>
                    </a>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </main>

      {submitting && (
        <SubmitModal
          assignment={submitting}
          onClose={() => setSubmitting(null)}
          onSubmitted={() => {
            setSubmitting(null);
            reloadAssignments();
            toast.success("Submitted");
          }}
        />
      )}
    </div>
  );
}

