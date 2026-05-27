import { ChangeEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ImageCropModal } from "./ImageCropModal";

interface Props {
  value?: string | null;
  onChange: (file: File) => void;
  accept?: string;
  hint?: string;
  label?: string;
  preview?: boolean;
  className?: string;
  cropAspectRatio?: number;
}

export function FileUpload({ value, onChange, accept = "image/*", hint, label, preview = true, className, cropAspectRatio }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected after cancelling crop
    e.target.value = "";

    if (cropAspectRatio && file.type.startsWith("image/")) {
      setCropSrc(URL.createObjectURL(file));
      return;
    }

    if (preview && file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    onChange(file);
  };

  const handleCrop = (file: File, url: string) => {
    setPreviewUrl(url);
    setCropSrc(null);
    onChange(file);
  };

  return (
    <>
      <div className={cn("flex flex-col gap-2", className)}>
        {label && <label className="text-label text-ink-variant font-medium">{label}</label>}
        <div
          className="relative border-2 border-dashed border-ink-outlineVariant rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary-container hover:bg-surface-containerLow transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {preview && previewUrl ? (
            <img src={previewUrl} alt="preview" className="w-20 h-20 rounded-lg object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-lg bg-surface-container grid place-items-center text-ink-outline">
              <span className="icon text-[24px]">cloud_upload</span>
            </div>
          )}
          <div className="flex-1">
            <p className="text-body-sm font-medium text-ink">{previewUrl ? "Change file" : "Click to upload"}</p>
            <p className="text-label text-ink-outline">{hint || "Drag & drop or click to browse"}</p>
          </div>
        </div>
        <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
      </div>

      {cropSrc && cropAspectRatio && (
        <ImageCropModal
          src={cropSrc}
          aspect={cropAspectRatio}
          onCancel={() => setCropSrc(null)}
          onCrop={handleCrop}
        />
      )}
    </>
  );
}
