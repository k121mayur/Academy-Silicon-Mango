import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FileUpload } from "@/components/shared/FileUpload";
import { extractErrorMessage } from "@/lib/api";
import { submitAssignment, type StudentAssignment } from "@/services/student.service";

export function SubmitModal({
  assignment,
  onClose,
  onSubmitted,
}: {
  assignment: StudentAssignment;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [content, setContent] = useState(assignment.submission?.content ?? "");
  const [url, setUrl] = useState(assignment.submission?.file_url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const t = assignment.assignment_type;
  const needsText = t === "text_upload" || t === "quiz";
  const needsUrl = t === "link_submission";
  const needsFile = t === "pdf_upload" || t === "file_upload";

  const submit = async () => {
    if (needsText && !content.trim()) return toast.error("Text is required");
    if (needsUrl && !url.trim()) return toast.error("URL is required");
    if (needsFile && !file) return toast.error("Pick a file");
    setBusy(true);
    try {
      await submitAssignment(assignment.id, {
        content: needsText ? content.trim() : undefined,
        url: needsUrl ? url.trim() : undefined,
        file: needsFile ? file ?? undefined : undefined,
      });
      onSubmitted();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Submit — ${assignment.title}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {assignment.description && (
          <p className="text-body-sm text-ink-variant whitespace-pre-wrap">{assignment.description}</p>
        )}
        {needsText && (
          <div>
            <label className="text-label text-ink-variant font-medium">Your answer *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[140px] mt-1 p-2 border border-ink-outlineVariant rounded-md text-body-sm bg-surface-lowest focus:outline-none focus:ring-4 focus:ring-primary-container/30 focus:border-primary"
            />
          </div>
        )}
        {needsUrl && (
          <Input label="URL *" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        )}
        {needsFile && (
          <FileUpload
            onChange={(f) => setFile(f)}
            preview={false}
            accept={t === "pdf_upload" ? ".pdf" : undefined}
            hint={t === "pdf_upload" ? "PDF only" : "Any file"}
          />
        )}
      </div>
    </Modal>
  );
}
