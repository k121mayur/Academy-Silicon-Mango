import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface Props {
  html?: string | null;
  className?: string;
  fallback?: string;
}

function sanitize(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "code", "pre", "span", "a"],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    ALLOW_DATA_ATTR: false,
  });
}

export function RichTextView({ html, className, fallback = "—" }: Props) {
  const trimmed = (html || "").trim();
  if (!trimmed || trimmed === "<p></p>") {
    return <p className={cn("text-body-sm text-ink-outline", className)}>{fallback}</p>;
  }

  return (
    <div
      className={cn("rich-text text-body-sm text-ink leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: sanitize(trimmed) }}
    />
  );
}

export function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
