import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api";
import { fetchBatchSessions, fetchMyBatches, StudentBatch, StudentResource, StudentSession } from "@/services/student.service";
import { SecureVideoPlayer } from "@/components/shared/SecureVideoPlayer";
import { RichTextView } from "@/components/shared/RichTextView";

interface Lesson {
  sessionId: string;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  duration_mins: number;
  video?: Extract<StudentResource, { resource_type: "video" }>;
  otherResources: Exclude<StudentResource, { resource_type: "video" }>[];
}

function lessonsFromSessions(sessions: StudentSession[]): Lesson[] {
  const out: Lesson[] = [];
  for (const s of sessions) {
    if (s.session_type !== "recorded") continue;
    const video = s.resources.find((r) => r.resource_type === "video") as
      | Extract<StudentResource, { resource_type: "video" }>
      | undefined;
    const others = s.resources.filter((r) => r.resource_type !== "video") as Exclude<
      StudentResource,
      { resource_type: "video" }
    >[];
    out.push({
      sessionId: s.id,
      title: s.title,
      description: s.description,
      scheduled_at: s.scheduled_at,
      duration_mins: s.duration_mins,
      video,
      otherResources: others,
    });
  }
  return out;
}

function statusBadge(status: Lesson["video"] extends infer V ? (V extends { status: infer S } ? S : never) : never) {
  switch (status) {
    case "ready":
      return <Badge tone="success">Ready</Badge>;
    case "uploaded":
    case "queued":
      return <Badge tone="warning">Pending optimization</Badge>;
    case "processing":
      return <Badge tone="primary">Optimizing…</Badge>;
    case "failed":
      return <Badge tone="danger">Failed</Badge>;
    default:
      return <Badge tone="neutral">{status}</Badge>;
  }
}

export default function SelfPacedCourse() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<StudentBatch | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchMyBatches(), fetchBatchSessions(batchId)])
      .then(([batches, sessions]) => {
        if (cancelled) return;
        const b = batches.find((x) => x.id === batchId) || null;
        setBatch(b);
        setLessons(lessonsFromSessions(sessions));
      })
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const activeLesson = lessons[activeIdx];

  const totalReady = useMemo(
    () => lessons.filter((l) => l.video && l.video.status === "ready").length,
    [lessons]
  );

  if (loading) {
    return <p className="text-body-sm text-ink-outline p-5">Loading…</p>;
  }

  if (!batch) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <span className="icon text-[40px] text-ink-outline">block</span>
        <p className="mt-2 text-body-sm text-ink-variant">
          Batch not found or you're not enrolled.
        </p>
        <Button className="mt-4" onClick={() => navigate("/portal/my-courses")}>Back to My Courses</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-lowest">
      {/* Top bar */}
      <header className="px-4 md:px-6 h-14 border-b border-ink-outlineVariant/40 flex items-center gap-3 sticky top-0 bg-surface-lowest z-10">
        <button
          onClick={() => navigate("/portal/my-courses")}
          className="flex items-center gap-1 text-body-sm text-ink-variant hover:text-ink"
        >
          <span className="icon text-[18px]">arrow_back</span>
          My Courses
        </button>
        <span className="text-ink-outline">·</span>
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{batch.course_title}</p>
          <p className="text-label text-ink-outline truncate">
            {batch.name} · {totalReady} of {lessons.length} lesson(s) available
          </p>
        </div>
      </header>

      <div className="grid md:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] min-h-[calc(100vh-3.5rem)]">
        {/* Sidebar — lesson list */}
        <aside className="border-r border-ink-outlineVariant/40 bg-surface-containerLow overflow-y-auto scrollbar-thin">
          <div className="p-3">
            <p className="text-label uppercase tracking-wide text-ink-outline px-2 mb-2">
              Lessons
            </p>
            {lessons.length === 0 ? (
              <p className="text-body-sm text-ink-outline px-2">No lessons uploaded yet.</p>
            ) : (
              <ul className="space-y-1">
                {lessons.map((l, i) => {
                  const isActive = i === activeIdx;
                  const isReady = l.video?.status === "ready";
                  return (
                    <li key={l.sessionId}>
                      <button
                        onClick={() => setActiveIdx(i)}
                        className={`w-full text-left p-3 rounded-xl transition-colors ${
                          isActive
                            ? "bg-primary-container/40 text-primary-onContainer"
                            : "hover:bg-surface-container text-ink"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`icon text-[18px] mt-0.5 ${
                              isReady ? "text-primary" : "text-ink-outline"
                            }`}
                          >
                            {isReady ? "play_circle" : "schedule"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-body-sm font-medium truncate">
                              {i + 1}. {l.title}
                            </p>
                            <p className="text-label text-ink-outline">
                              {l.video
                                ? l.video.status === "ready"
                                  ? l.video.duration_seconds
                                    ? `${Math.round(l.video.duration_seconds / 60)} min`
                                    : "Ready"
                                  : "Pending"
                                : "No video"}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="p-4 md:p-6 max-w-5xl">
          {!activeLesson ? (
            <p className="text-body-sm text-ink-outline">Pick a lesson to start.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h1 className="font-display font-bold text-display-md text-ink">{activeLesson.title}</h1>
                  <p className="text-label text-ink-outline mt-1">
                    Lesson {activeIdx + 1} of {lessons.length}
                  </p>
                </div>
                {activeLesson.video && statusBadge(activeLesson.video.status as any)}
              </div>

              {/* Player */}
              {activeLesson.video ? (
                activeLesson.video.status === "ready" ? (
                  <SecureVideoPlayer
                    videoId={activeLesson.video.video_id}
                    watermarkCorner="top-right"
                  />
                ) : (
                  <div className="w-full aspect-video bg-black rounded-xl overflow-hidden grid place-items-center p-6 text-center">
                    <div>
                      <span className="icon text-white/70 text-[40px]">hourglass_empty</span>
                      <p className="text-white/90 font-medium mt-2">
                        {activeLesson.video.status === "failed"
                          ? "This lesson couldn't be optimized. Please check back later."
                          : "Pending optimization"}
                      </p>
                      <p className="text-white/60 text-body-sm mt-1 max-w-md mx-auto">
                        {activeLesson.video.status === "failed"
                          ? "Your instructor has been notified."
                          : "This lesson will be available after tonight's optimization."}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="w-full aspect-video bg-surface-containerLow rounded-xl grid place-items-center">
                  <p className="text-body-sm text-ink-outline">No video for this lesson</p>
                </div>
              )}

              {/* Description (rich text) */}
              {activeLesson.description && (
                <section className="bg-surface-containerLow rounded-xl p-4">
                  <p className="text-label uppercase tracking-wide text-ink-outline mb-2">About this lesson</p>
                  <RichTextView html={activeLesson.description} />
                </section>
              )}

              {/* Extra resources */}
              {activeLesson.otherResources.length > 0 && (
                <section>
                  <p className="text-label uppercase tracking-wide text-ink-outline mb-2">Resources</p>
                  <ul className="space-y-2">
                    {activeLesson.otherResources.map((r) => (
                      <li key={r.id}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-surface-containerLow rounded-lg hover:bg-surface-container transition-colors"
                        >
                          <span className="icon text-primary">
                            {r.resource_type === "link" ? "link" : "description"}
                          </span>
                          <span className="text-body-sm font-medium text-ink truncate">{r.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Nav buttons */}
              <div className="flex justify-between pt-3 border-t border-ink-outlineVariant/40">
                <Button
                  variant="ghost"
                  leftIcon="navigate_before"
                  disabled={activeIdx === 0}
                  onClick={() => setActiveIdx(activeIdx - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="primary"
                  rightIcon="navigate_next"
                  disabled={activeIdx >= lessons.length - 1}
                  onClick={() => setActiveIdx(activeIdx + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
