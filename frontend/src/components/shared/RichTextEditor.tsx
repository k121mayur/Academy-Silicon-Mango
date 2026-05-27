import { ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  label?: string;
  placeholder?: string;
  containerClassName?: string;
  minHeight?: number;
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
        active ? "bg-primary text-white" : "text-ink-variant hover:bg-surface-container"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, label, placeholder, containerClassName, minHeight = 140 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: { HTMLAttributes: { class: "" } } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || "Write here…" }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      {label && <label className="text-label text-ink-variant font-medium">{label}</label>}
      <div className="rounded-md border border-ink-outlineVariant focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-container/30 transition-colors overflow-hidden bg-surface-lowest">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-ink-outlineVariant/40 bg-surface-containerLow flex-wrap">
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

          <Sep />

          <Btn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
            <span className="icon text-[16px]">undo</span>
          </Btn>
          <Btn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">
            <span className="icon text-[16px]">redo</span>
          </Btn>
        </div>

        {/* ── Content area ── */}
        <div className="rich-text px-3 py-2.5 text-body-sm text-ink cursor-text" style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
