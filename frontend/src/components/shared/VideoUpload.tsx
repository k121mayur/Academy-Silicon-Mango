import { ChangeEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useVideoUploadStore } from "@/features/instructor/videoUploadStore";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB — matches backend MAX_VIDEO_MB
const MIN_VIDEO_BYTES = 10 * 1024 * 1024; //  10 MB — matches backend MIN_VIDEO_MB

interface Props {
  sessionId: string;
  className?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoUpload({ sessionId, className }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = useVideoUploadStore((s) => s.uploads[sessionId]);
  const start = useVideoUploadStore((s) => s.start);
  const uploading = active?.status === "uploading";

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Please pick a video file (mp4, mov, mkv, webm…)");
      return;
    }
    if (f.size < MIN_VIDEO_BYTES) {
      toast.error("Video is smaller than 10 MB — please upload the full lesson video.");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      toast.error("Video is larger than 500 MB.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onUpload = () => {
    if (!file) {
      toast.error("Pick a video first.");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the lesson a title.");
      return;
    }
    start(sessionId, file, title.trim());
    // Local picker state is no longer needed — the store now owns this upload.
    setFile(null);
    setTitle("");
  };

  // ── In-progress upload: persisted view (survives closing/reopening the dialog) ──
  if (uploading) {
    const pct = (active.progress * 100).toFixed(0);
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-containerLow border border-ink-outlineVariant/60">
          <span className="icon text-primary text-[28px] animate-pulse">cloud_upload</span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-ink truncate">{active.title || active.fileName}</p>
            <p className="text-label text-ink-outline truncate">Uploading {active.fileName}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full bg-primary-fill transition-all duration-150" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-label text-ink-outline">
            <span>{pct}% uploaded</span>
            {active.eta != null && active.eta > 0 && (
              <span>~{active.eta < 60 ? `${Math.round(active.eta)}s` : `${Math.round(active.eta / 60)}m`} remaining</span>
            )}
          </div>
        </div>
        <p className="text-label text-ink-outline">
          Upload in progress — you can close this dialog and it will keep running. Reopen "Add resource"
          to check on it. A new upload can be added once this one finishes.
        </p>
      </div>
    );
  }

  // ── Idle: file picker + upload button ──
  return (
    <div className={cn("space-y-3", className)}>
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-5 flex items-center gap-4 transition-colors border-ink-outlineVariant hover:border-primary hover:bg-surface-containerLow cursor-pointer"
      >
        <div className="w-14 h-14 rounded-xl bg-primary-container/40 text-primary grid place-items-center shrink-0">
          <span className="icon text-[28px]">videocam</span>
        </div>
        <div className="flex-1 min-w-0">
          {file ? (
            <>
              <p className="text-body-sm font-medium text-ink truncate">{file.name}</p>
              <p className="text-label text-ink-outline">{formatBytes(file.size)} · click to change</p>
            </>
          ) : (
            <>
              <p className="text-body-sm font-medium text-ink">Click to pick a video file</p>
              <p className="text-label text-ink-outline">10 MB – 500 MB · MP4 / MOV / MKV / WEBM</p>
            </>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="video/*" onChange={onPick} className="hidden" />

      <Input
        label="Lesson title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Week 1 — Introduction"
      />

      <div className="flex justify-end">
        <Button onClick={onUpload} disabled={!file || !title.trim()} leftIcon="upload">
          Upload video
        </Button>
      </div>

      <p className="text-label text-ink-outline">
        Videos are automatically optimized to a single 720p stream in the midnight batch to reduce server
        load and bandwidth. Students can watch once optimization completes.
      </p>
    </div>
  );
}
