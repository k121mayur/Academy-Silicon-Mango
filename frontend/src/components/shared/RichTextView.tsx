import { cn } from "@/lib/utils";

interface Props {
  html?: string | null;
  className?: string;
  fallback?: string;
}

const SAFE_TAG_PATTERN =
  /<(?!\/?(?:p|br|strong|b|em|i|u|s|h2|h3|ul|ol|li|blockquote|code|pre|span)\b)[^>]*>/gi;
const EVENT_HANDLER_PATTERN = / on[a-z]+\s*=\s*"[^"]*"/gi;
const JAVASCRIPT_HREF_PATTERN = /(href|src)\s*=\s*"\s*javascript:[^"]*"/gi;

function sanitize(input: string): string {
  return input
    .replace(SAFE_TAG_PATTERN, "")
    .replace(EVENT_HANDLER_PATTERN, "")
    .replace(JAVASCRIPT_HREF_PATTERN, "$1=\"#\"");
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
