import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api";

interface Props {
  html?: string | null;
  className?: string;
  fallback?: string;
  /** When true, also allow <img> and YouTube <iframe> (used for blog content). */
  allowMedia?: boolean;
}

const BASE_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "code", "pre", "span", "a"];
const BASE_ATTR = ["href", "target", "rel", "class"];
const MEDIA_TAGS = ["img", "figure", "figcaption", "div", "iframe"];
const MEDIA_ATTR = ["src", "alt", "title", "width", "height", "style", "loading", "referrerpolicy", "allow", "allowfullscreen", "frameborder"];

// Only YouTube embeds are permitted as iframes — everything else is dropped.
const YOUTUBE_SRC = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i;

function sanitize(input: string, allowMedia: boolean): string {
  if (allowMedia) {
    // Drop any iframe that is not a YouTube embed (the "YouTube only" gate).
    DOMPurify.addHook("uponSanitizeElement", (node, data) => {
      if (data.tagName === "iframe") {
        const el = node as Element;
        const src = el.getAttribute?.("src") || "";
        if (!YOUTUBE_SRC.test(src)) {
          el.parentNode?.removeChild(el);
        }
      }
    });
    // Harden media nodes + absolutise server-relative upload paths so images
    // saved as "/uploads/.." resolve no matter where the SPA is served from.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      const el = node as Element;
      if (el.tagName === "IMG") {
        const src = el.getAttribute("src") || "";
        if (src.startsWith("/")) el.setAttribute("src", `${API_ORIGIN}${src}`);
        el.setAttribute("loading", "lazy");
      } else if (el.tagName === "IFRAME") {
        el.setAttribute("loading", "lazy");
        el.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        el.setAttribute("allowfullscreen", "true");
      } else if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
        el.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: allowMedia ? [...BASE_TAGS, ...MEDIA_TAGS] : BASE_TAGS,
    ALLOWED_ATTR: allowMedia ? [...BASE_ATTR, ...MEDIA_ATTR] : BASE_ATTR,
    ALLOW_DATA_ATTR: allowMedia, // lets Tiptap's data-youtube-video wrapper survive
    ADD_ATTR: allowMedia ? ["allowfullscreen", "frameborder"] : [],
  });

  if (allowMedia) {
    DOMPurify.removeHook("uponSanitizeElement");
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
  return clean;
}

export function RichTextView({ html, className, fallback = "—", allowMedia = false }: Props) {
  const trimmed = (html || "").trim();
  if (!trimmed || trimmed === "<p></p>") {
    return <p className={cn("text-body-sm text-ink-outline", className)}>{fallback}</p>;
  }

  return (
    <div
      className={cn("rich-text text-body-sm text-ink leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: sanitize(trimmed, allowMedia) }}
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
