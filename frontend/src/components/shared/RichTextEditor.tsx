import { ReactNode, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { cn } from "@/lib/utils";
import { absoluteApiUrl } from "@/lib/api";
import { extractYouTubeId, normalizeImageUrl } from "@/lib/media";

interface Props {
  value: string;
  onChange: (html: string) => void;
  label?: string;
  placeholder?: string;
  containerClassName?: string;
  minHeight?: number;
  /** When true, enables inline image + YouTube insertion (used for blog posts). */
  enableMedia?: boolean;
  /** Uploads a picked image file and resolves to its stored URL (e.g. /uploads/..). */
  onImageUpload?: (file: File) => Promise<string>;
}

function Sep() {
  return <div className="w-px h-5 bg-ink-outlineVariant mx-0.5 shrink-0" />;
}

function Btn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "w-7 h-7 grid place-items-center rounded text-[13px] font-medium transition-colors shrink-0",
        active ? "bg-primary-fill text-primary-on" : "text-ink-variant hover:bg-surface-container"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  label,
  placeholder,
  containerClassName,
  minHeight = 140,
  enableMedia = false,
  onImageUpload,
}: Props) {
  const [menu, setMenu] = useState<null | "image" | "youtube">(null);
  const [imgUrl, setImgUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: { HTMLAttributes: { class: "" } } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || "Write here…" }),
      ...(enableMedia
        ? [
            Image.configure({ HTMLAttributes: { class: "blog-img", loading: "lazy" } }),
            Youtube.configure({ controls: true, nocookie: true, modestBranding: true, HTMLAttributes: { class: "blog-yt" } }),
          ]
        : []),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  const closeMenu = () => {
    setMenu(null);
    setImgUrl("");
    setYtUrl("");
  };

  const insertImageByUrl = () => {
    const src = normalizeImageUrl(imgUrl);
    if (!src) return;
    editor.chain().focus().setImage({ src }).run();
    closeMenu();
  };

  const pickFile = () => fileRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file || !onImageUpload) return;
    setUploading(true);
    try {
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: absoluteApiUrl(url) }).run();
      closeMenu();
    } finally {
      setUploading(false);
    }
  };

  const insertYouTube = () => {
    const id = extractYouTubeId(ytUrl);
    if (!id) return;
    // Pass a canonical watch URL so the extension reliably builds the embed.
    editor.commands.setYoutubeVideo({ src: `https://www.youtube.com/watch?v=${id}` });
    editor.commands.focus();
    closeMenu();
  };

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && <label className="text-label text-ink-variant font-medium">{label}</label>}
      <div className="rounded-md border border-ink-outlineVariant focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-container/30 transition-colors overflow-hidden bg-surface-lowest">
        {/* ── Toolbar ── */}
        <div className="relative flex items-center gap-0.5 px-2 py-1.5 border-b border-ink-outlineVariant/40 bg-surface-containerLow flex-wrap">
          <Btn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
            <strong>B</strong>
          </Btn>
          <Btn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
            <em>I</em>
          </Btn>
          <Btn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
            <u>U</u>
          </Btn>
          <Btn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <s>S</s>
          </Btn>

          <Sep />

          <Btn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            H2
          </Btn>
          <Btn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            H3
          </Btn>

          <Sep />

          <Btn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
            <span className="icon text-[16px]">format_list_bulleted</span>
          </Btn>
          <Btn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">
            <span className="icon text-[16px]">format_list_numbered</span>
          </Btn>

          <Sep />

          <Btn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
            <span className="icon text-[16px]">format_quote</span>
          </Btn>
          <Btn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
            <span className="icon text-[16px]">code</span>
          </Btn>

          {enableMedia && (
            <>
              <Sep />
              <Btn active={menu === "image"} onClick={() => setMenu((m) => (m === "image" ? null : "image"))} title="Insert image (upload or link)">
                <span className="icon text-[16px]">image</span>
              </Btn>
              <Btn active={menu === "youtube"} onClick={() => setMenu((m) => (m === "youtube" ? null : "youtube"))} title="Embed YouTube video">
                <span className="icon text-[16px]">smart_display</span>
              </Btn>
            </>
          )}

          <Sep />

          <Btn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
            <span className="icon text-[16px]">undo</span>
          </Btn>
          <Btn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">
            <span className="icon text-[16px]">redo</span>
          </Btn>

          {/* ── Media popovers ── */}
          {enableMedia && menu === "image" && (
            <div className="absolute z-20 top-full left-2 mt-1 w-[320px] max-w-[calc(100%-1rem)] rounded-xl border border-ink-outlineVariant/60 bg-surface-lowest shadow-modal p-3 space-y-2">
              <p className="text-label font-medium text-ink-variant">Paste image link (any URL, incl. Google Drive)</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={imgUrl}
                  onChange={(e) => setImgUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertImageByUrl(); } }}
                  placeholder="https://…"
                  className="flex-1 h-9 rounded-md border border-ink-outlineVariant bg-surface-lowest px-2.5 text-body-sm text-ink focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={insertImageByUrl} className="h-9 px-3 rounded-md bg-primary-fill text-primary-on text-body-sm font-medium shrink-0">
                  Insert
                </button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-ink-outlineVariant/40" />
                <span className="text-label text-ink-outline">or</span>
                <div className="flex-1 h-px bg-ink-outlineVariant/40" />
              </div>
              <button
                type="button"
                onClick={pickFile}
                disabled={uploading || !onImageUpload}
                className="w-full h-9 rounded-md border border-ink-outlineVariant text-body-sm text-ink hover:bg-surface-container disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <span className="icon text-[16px]">{uploading ? "progress_activity" : "upload"}</span>
                {uploading ? "Uploading…" : "Upload image"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}
              />
            </div>
          )}

          {enableMedia && menu === "youtube" && (
            <div className="absolute z-20 top-full left-2 mt-1 w-[320px] max-w-[calc(100%-1rem)] rounded-xl border border-ink-outlineVariant/60 bg-surface-lowest shadow-modal p-3 space-y-2">
              <p className="text-label font-medium text-ink-variant">YouTube video URL</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); insertYouTube(); } }}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="flex-1 h-9 rounded-md border border-ink-outlineVariant bg-surface-lowest px-2.5 text-body-sm text-ink focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={insertYouTube} className="h-9 px-3 rounded-md bg-primary-fill text-primary-on text-body-sm font-medium shrink-0">
                  Embed
                </button>
              </div>
              <p className="text-label text-ink-outline">Only YouTube links are supported.</p>
            </div>
          )}
        </div>

        {/* ── Content area ── */}
        <div className="rich-text px-3 py-2.5 text-body-sm text-ink cursor-text" style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
