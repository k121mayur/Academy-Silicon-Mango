import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FileUpload } from "@/components/shared/FileUpload";
import { absoluteApiUrl, extractErrorMessage } from "@/lib/api";
import {
  addResource,
  createSession,
  deleteResource,
  deleteSession,
  fetchBatches,
  fetchSessions,
  updateSession,
  type InstructorBatch,
  type InstructorSession,
} from "@/services/instructor.service";
import { VideoUpload } from "@/components/shared/VideoUpload";
import { useSelectedBatch } from "@/features/instructor/selectedBatchStore";
import { useVideoUploadStore } from "@/features/instructor/videoUploadStore";
import { NoBatchSelected } from "./_NoBatch";

const STATUS_OPTS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const TYPE_OPTS = [
  { value: "live", label: "Live" },
  { value: "recorded", label: "Recorded" },
];

const RESOURCE_TYPE_OPTS = [
  { value: "file", label: "File" },
  { value: "link", label: "Link" },
  { value: "video", label: "Video" },
];

export default function SessionsResources() {
  const { selectedBatchId } = useSelectedBatch();
  const [sessions, setSessions] = useState<InstructorSession[]>([]);
  const [batch, setBatch] = useState<InstructorBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<InstructorSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InstructorSession | null>(null);
  const [resourceModalFor, setResourceModalFor] = useState<InstructorSession | null>(null);

  const reload = async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const [data, batches] = await Promise.all([fetchSessions(selectedBatchId), fetchBatches()]);
      setSessions(data);
      setBatch(batches.find((b) => b.id === selectedBatchId) || null);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBatchId]);

  // Video uploads run in a global store so they survive the dialog being closed.
  // When one finishes (anywhere), refresh the list so the new lesson appears.
  const videoUploads = useVideoUploadStore((s) => s.uploads);
  const clearUpload = useVideoUploadStore((s) => s.clear);
  useEffect(() => {
    const finished = Object.values(videoUploads).filter(
      (u) => u.status === "done" || u.status === "error"
    );
    if (finished.length === 0) return;
    for (const u of finished) {
      if (u.status === "done") toast.success("Video uploaded — it will be optimized to 720p tonight.");
      else toast.error(u.error || "Video upload failed");
      clearUpload(u.sessionId);
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUploads]);

  const isSelfPaced = batch?.delivery_mode === "recorded";

  if (!selectedBatchId) return <NoBatchSelected />;

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteSession(confirmDelete.id);
      toast.success("Session deleted");
      setConfirmDelete(null);
      reload();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Sessions & Resources</h1>
          <p className="text-body-sm text-ink-variant">
            Edit inherited sessions, add manual ones, attach resources. Saving session edits emails all enrolled students.
          </p>
        </div>
        <Button leftIcon="add" onClick={() => setCreating(true)}>New session</Button>
      </div>

      {loading && <p className="text-body-sm text-ink-outline">Loading sessions…</p>}
      {!loading && sessions.length === 0 && (
        <Card>
          <CardBody>
            <p className="text-body-sm text-ink-outline">No sessions yet. Use "New session" to add one.</p>
          </CardBody>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{s.title}</p>
                  <p className="text-label text-ink-outline">
                    {new Date(s.scheduled_at).toLocaleString()} · {s.duration_mins} mins
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Badge tone="neutral">{s.session_type}</Badge>
                  <Badge tone={s.status === "completed" ? "success" : s.status === "cancelled" ? "danger" : "primary"}>
                    {s.status}
                  </Badge>
                  <Badge tone={s.origin === "manual" ? "tertiary" : "neutral"}>{s.origin}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {s.description && <p className="text-body-sm text-ink-variant">{s.description}</p>}
              <div className="grid md:grid-cols-2 gap-3 text-body-sm">
                {s.meeting_link && (
                  <p className="truncate">
                    <span className="text-ink-outline">Meeting:</span>{" "}
                    <a href={s.meeting_link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {s.meeting_link}
                    </a>
                  </p>
                )}
                {s.recording_url && (
                  <p className="truncate">
                    <span className="text-ink-outline">Recording:</span>{" "}
                    <a href={s.recording_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {s.recording_url}
                    </a>
                  </p>
                )}
              </div>

              {s.resources.length > 0 && (
                <div>
                  <p className="text-label uppercase tracking-wide text-ink-outline mb-1">Resources</p>
                  <ul className="space-y-1">
                    {s.resources.map((r) => {
                      const isVideo = r.resource_type === "video";
                      const videoStatus = r.status;
                      return (
                      <li key={r.id} className="flex items-center justify-between gap-3 p-2 bg-surface-containerLow rounded-md">
                        <div className="min-w-0 flex items-center gap-2 flex-1">
                          <span className="icon text-ink-outline text-[18px]">
                            {isVideo ? "play_circle" : r.resource_type === "link" ? "link" : "description"}
                          </span>
                          {isVideo ? (
                            <div className="min-w-0 flex items-center gap-2 flex-wrap">
                              <span className="truncate text-ink font-medium">{r.title}</span>
                              {videoStatus === "ready" && <Badge tone="success">Ready</Badge>}
                              {(videoStatus === "uploaded" || videoStatus === "queued") && (
                                <Badge tone="warning">Pending optimization</Badge>
                              )}
                              {videoStatus === "processing" && <Badge tone="primary">Optimizing…</Badge>}
                              {videoStatus === "failed" && <Badge tone="danger">Failed</Badge>}
                              {videoStatus === "missing" && <Badge tone="danger">Missing</Badge>}
                            </div>
                          ) : (
                            <a href={absoluteApiUrl(r.url)} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                              {r.title}
                            </a>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete resource "${r.title}"?`)) return;
                            try {
                              await deleteResource(r.id);
                              toast.success("Resource removed");
                              reload();
                            } catch (e) {
                              toast.error(extractErrorMessage(e));
                            }
                          }}
                          className="icon text-danger hover:bg-danger-container/40 rounded p-1"
                          title="Remove resource"
                        >
                          close
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" leftIcon="edit" onClick={() => setEditing(s)}>Edit</Button>
                <Button size="sm" variant="outline" leftIcon="attach_file" onClick={() => setResourceModalFor(s)}>Add resource</Button>
                {s.origin === "manual" && (
                  <Button size="sm" variant="danger" leftIcon="delete" onClick={() => setConfirmDelete(s)}>Delete</Button>
                )}
                {s.origin === "inherited" && (
                  <span className="text-label text-ink-outline self-center">Inherited — cancel via status edit, not delete</span>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {editing && (
        <EditSessionModal
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={(notified) => {
            setEditing(null);
            reload();
            if (notified > 0) toast.success(`Saved · notified ${notified} student(s)`);
            else toast.success("Saved");
          }}
        />
      )}
      {creating && selectedBatchId && (
        <CreateSessionModal
          batchId={selectedBatchId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
            toast.success("Session created");
          }}
        />
      )}
      {resourceModalFor && (
        <AddResourceModal
          session={resourceModalFor}
          isSelfPaced={isSelfPaced}
          onClose={() => setResourceModalFor(null)}
          onAdded={() => {
            setResourceModalFor(null);
            reload();
            toast.success("Resource added");
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          open
          title="Delete session"
          description={`This will permanently remove "${confirmDelete.title}". This cannot be undone.`}
          destructive
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function EditSessionModal({
  session,
  onClose,
  onSaved,
}: {
  session: InstructorSession;
  onClose: () => void;
  onSaved: (notified: number) => void;
}) {
  const [title, setTitle] = useState(session.title);
  const [description, setDescription] = useState(session.description ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(session.scheduled_at));
  const [duration, setDuration] = useState(session.duration_mins);
  const [sessionType, setSessionType] = useState(session.session_type);
  const [status, setStatus] = useState(session.status);
  const [meetingLink, setMeetingLink] = useState(session.meeting_link ?? "");
  const [recordingUrl, setRecordingUrl] = useState(session.recording_url ?? "");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!scheduledAt) {
      toast.error("Date & time is required");
      return;
    }
    if (duration <= 0) {
      toast.error("Duration must be positive");
      return;
    }
    setSaving(true);
    try {
      const res = await updateSession(session.id, {
        title: title.trim(),
        description: description.trim() || "",
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_mins: duration,
        session_type: sessionType,
        status,
        meeting_link: meetingLink.trim(),
        recording_url: recordingUrl.trim(),
        notify_students: notify,
      });
      onSaved(res.meta?.students_notified ?? 0);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit session — ${session.title}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label className="text-label text-ink-variant font-medium">Description</label>
          <textarea
            className="w-full min-h-[80px] mt-1 p-2 border border-ink-outlineVariant rounded-md text-body-sm bg-surface-lowest"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Date & time *" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <Input label="Duration (mins) *" type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select label="Type" value={sessionType} onChange={(e) => setSessionType(e.target.value as any)} options={TYPE_OPTS} />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as any)} options={STATUS_OPTS} />
        </div>
        <Input label="Meeting link (live)" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." />
        <Input label="Recording URL (recorded)" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://..." />
        <label className="flex items-center gap-2 text-body-sm text-ink">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email all enrolled students about this change
        </label>
      </div>
    </Modal>
  );
}

function CreateSessionModal({
  batchId,
  onClose,
  onCreated,
}: {
  batchId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [sessionType, setSessionType] = useState<"live" | "recorded">("live");
  const [meetingLink, setMeetingLink] = useState("");
  const [recordingUrl, setRecordingUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!scheduledAt) return toast.error("Date & time is required");
    if (duration <= 0) return toast.error("Duration must be positive");
    setSaving(true);
    try {
      await createSession(batchId, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_mins: duration,
        session_type: sessionType,
        meeting_link: meetingLink.trim() || undefined,
        recording_url: recordingUrl.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New manual session"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <label className="text-label text-ink-variant font-medium">Description</label>
          <textarea
            className="w-full min-h-[80px] mt-1 p-2 border border-ink-outlineVariant rounded-md text-body-sm bg-surface-lowest"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Date & time *" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <Input label="Duration (mins) *" type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
        </div>
        <Select label="Type" value={sessionType} onChange={(e) => setSessionType(e.target.value as any)} options={TYPE_OPTS} />
        <Input label="Meeting link (live)" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://..." />
        <Input label="Recording URL (recorded)" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://..." />
      </div>
    </Modal>
  );
}

function AddResourceModal({
  session,
  isSelfPaced,
  onClose,
  onAdded,
}: {
  session: InstructorSession;
  isSelfPaced: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  // For self-paced batches, default to video; for live batches, default to file.
  const [resourceType, setResourceType] = useState<"file" | "link" | "video">(
    isSelfPaced ? "video" : "file"
  );
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // If a video upload for this session is still running, show only that progress
  // (not a fresh resource form) until it completes.
  const activeUpload = useVideoUploadStore((s) => s.uploads[session.id]);
  const uploadInProgress = activeUpload?.status === "uploading";

  const submit = async () => {
    if (resourceType === "video") {
      return; // VideoUpload component handles its own submit
    }
    if (!title.trim()) return toast.error("Title is required");
    if (resourceType === "file") {
      if (!file) return toast.error("Pick a file");
    } else if (!url.trim()) {
      return toast.error("URL is required");
    }
    setSaving(true);
    try {
      await addResource(session.id, {
        title: title.trim(),
        resource_type: resourceType,
        file: file ?? undefined,
        url: url.trim() || undefined,
      });
      onAdded();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  // For self-paced batches, restrict type options — videos go through the dedicated endpoint.
  // For live batches, keep all three options but rely on backend bounce-error to reject MP4-as-file.
  const typeOptions = isSelfPaced
    ? [
        { value: "video", label: "Video lesson (HLS)" },
        { value: "file", label: "Supplementary file (≤ 2 MB)" },
        { value: "link", label: "External link" },
      ]
    : RESOURCE_TYPE_OPTS;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add resource to "${session.title}"`}
      size="md"
      footer={
        resourceType === "video" || uploadInProgress ? (
          <Button variant="ghost" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Add</Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {uploadInProgress ? (
          // A video upload is still running for this session — show its progress only.
          <VideoUpload sessionId={session.id} />
        ) : (
        <>
        <Select label="Type" value={resourceType} onChange={(e) => setResourceType(e.target.value as any)} options={typeOptions} />

        {resourceType === "video" ? (
          <VideoUpload sessionId={session.id} />
        ) : (
          <>
            <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
            {resourceType === "file" ? (
              <FileUpload
                onChange={(f) => setFile(f)}
                accept="*"
                preview={false}
                hint="Slides, PDF, docs, etc. — max 2 MB"
              />
            ) : (
              <Input label="URL *" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            )}
          </>
        )}
        </>
        )}
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

