import { ChangeEvent, MouseEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { absoluteApiUrl } from "@/lib/api";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — matches backend MAX_DOC_MB

interface Props {
  value?: string | null;
  onChange: (file: File) => void;
  accept?: string;
  hint?: string;
  label?: string;
  preview?: boolean;
  className?: string;
  /** When provided, shows a remove button that clears the current/selected file. */
  onClear?: () => void;
  /** Max bytes the user can pick. Defaults to 2 MB to match backend doc cap. */
  maxBytes?: number;
}

export function FileUpload({ value, onChange, accept = "image/*", hint, label, preview = true, className, onClear, maxBytes = DEFAULT_MAX_BYTES }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep showing the server-side file when the parent loads it asynchronously,
  // but never clobber a file the user just picked.
  useEffect(() => {
    if (!dirty) setPreviewUrl(value || null);
  }, [value, dirty]);

  const existingFileName = (() => {
    if (selectedFileName || !previewUrl) return null;
    if (previewUrl.startsWith("blob:") || previewUrl.startsWith("data:")) return null;
    const segment = previewUrl.split("?")[0].split("#")[0].split("/").filter(Boolean).pop();
    try {
      return segment ? decodeURIComponent(segment) : null;
    } catch {
      return segment || null;
    }
  })();

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = "";

    if (file.size > maxBytes) {
      const capMb = Math.max(1, Math.floor(maxBytes / (1024 * 1024)));
      toast.error(`File is too large — max ${capMb} MB.`);
      return;
    }

    if (preview && file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
      setSelectedFileName(null);
    } else {
      setSelectedFileName(file.name);
    }
    setDirty(true);
    onChange(file);
  };

  const handleClear = (e: MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setSelectedFileName(null);
    setDirty(true);
    if (inputRef.current) inputRef.current.value = "";
    onClear?.();
  };

  const hasFile = !!(selectedFileName || previewUrl);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <label className="text-label text-ink-variant font-medium">{label}</label>}
      <div
        className="relative border-2 border-dashed border-ink-outlineVariant rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary-container hover:bg-surface-containerLow transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {preview && previewUrl ? (
          <img src={previewUrl} alt="preview" className="w-20 h-20 rounded-lg object-cover" />
        ) : (
          <div className={cn("w-20 h-20 rounded-lg grid place-items-center", hasFile ? "bg-primary/10 text-primary" : "bg-surface-container text-ink-outline")}>
            <span className="icon text-[24px]">{hasFile ? "description" : "cloud_upload"}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-medium text-ink truncate">
            {selectedFileName ?? existingFileName ?? (previewUrl ? "Change file" : "Click to upload")}
          </p>
          <p className="text-label text-ink-outline">
            {hasFile
              ? "Click to replace"
              : (hint || `Drag & drop or click to browse · max ${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))} MB`)}
          </p>
          {existingFileName && !preview && previewUrl && (
            <a
              href={absoluteApiUrl(previewUrl)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-1 text-label text-primary hover:underline"
            >
              <span className="icon text-[14px]">open_in_new</span> View current file
            </a>
          )}
        </div>
        {hasFile && onClear && (
          <button
            type="button"
            onClick={handleClear}
            title="Remove file"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-ink-outline hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <span className="icon text-[18px]">close</span>
          </button>
        )}
      </div>
      {/* A wildcard accept means "all files" — omit the attribute entirely so the
          OS file dialog defaults to All Files instead of one filtered type. */}
      <input
        ref={inputRef}
        type="file"
        accept={accept === "*" || accept === "*/*" ? undefined : accept}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
