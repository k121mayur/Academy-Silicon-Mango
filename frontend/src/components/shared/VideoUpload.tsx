import { ChangeEvent, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { extractErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { uploadVideo, VideoDTO } from "@/services/video.service";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

interface Props {
  sessionId: string;
  onUploaded?: (video: VideoDTO) => void;
  className?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoUpload({ sessionId, onUploaded, className }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const startRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("Please pick a video file (mp4, mov, mkv, webm…)");
      return;
    }
    if (f.size > MAX_VIDEO_BYTES) {
      toast.error("Video is larger than 500 MB.");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onUpload = async () => {
    if (!file) {
      toast.error("Pick a video first.");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the lesson a title.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setEta(null);
    startRef.current = Date.now();
    try {
      const video = await uploadVideo(sessionId, file, title.trim(), ({ progress, loaded, total }) => {
        setProgress(progress);
        const elapsed = (Date.now() - startRef.current) / 1000;
        const remaining = loaded > 0 ? (elapsed / loaded) * (total - loaded) : null;
        setEta(remaining);
      });
      toast.success("Uploaded — available after tonight's optimization.");
      setFile(null);
      setTitle("");
      setProgress(0);
      if (onUploaded) onUploaded(video);
    } catch (e) {
      toast.error(extractErrorMessage(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-5 flex items-center gap-4 transition-colors",
          uploading
            ? "border-ink-outlineVariant bg-surface-containerLow cursor-not-allowed"
            : "border-ink-outlineVariant hover:border-primary hover:bg-surface-containerLow cursor-pointer"
        )}
      >
        <div className="w-14 h-14 rounded-xl bg-primary-container/40 text-primary grid place-items-center shrink-0">
          <span className="icon text-[28px]">videocam</span>
        </div>
        <div className="flex-1 min-w-0">
          {file ? (
            <>
              <p className="text-body-sm font-medium text-ink truncate">{file.name}</p>
              <p className="text-label text-ink-outline">
                {formatBytes(file.size)} · click to change
              </p>
            </>
          ) : (
            <>
              <p className="text-body-sm font-medium text-ink">Click to pick a video file</p>
              <p className="text-label text-ink-outline">Max 500 MB · MP4 / MOV / MKV / WEBM</p>
            </>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={onPick}
        className="hidden"
        disabled={uploading}
      />

      <Input
        label="Lesson title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Week 1 — Introduction"
        disabled={uploading}
      />

      {uploading && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-surface-container overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${(progress * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="flex justify-between text-label text-ink-outline">
            <span>{(progress * 100).toFixed(0)}% uploaded</span>
            {eta != null && eta > 0 && (
              <span>
                ~{eta < 60 ? `${Math.round(eta)}s` : `${Math.round(eta / 60)}m`} remaining
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onUpload} loading={uploading} disabled={!file || !title.trim()} leftIcon="upload">
          Upload video
        </Button>
      </div>

      <p className="text-label text-ink-outline">
        Upload any quality — videos are automatically optimized to a single 720p stream at midnight to reduce server load and bandwidth. Students can watch once optimization completes.
      </p>
    </div>
  );
}
