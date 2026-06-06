import { useEffect } from "react";

interface Props {
  title?: string;
  description?: string;
  image?: string | null;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Dependency-free document title + Open Graph / meta tags for public pages.
 * Restores the previous <title> on unmount. (Rich social unfurl on bot crawlers
 * would need server-side prerender — that's a documented later enhancement.)
 */
export function MetaTags({ title, description, image }: Props) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) {
      document.title = `${title} — Silicon Mango Academy`;
      setMeta("property", "og:title", title);
    }
    if (description) {
      setMeta("name", "description", description);
      setMeta("property", "og:description", description);
    }
    setMeta("property", "og:type", "website");
    setMeta("property", "og:url", window.location.href);
    if (image) {
      const abs = image.startsWith("http") ? image : `${window.location.origin}${image}`;
      setMeta("property", "og:image", abs);
    }
    setMeta("name", "twitter:card", "summary_large_image");
    return () => {
      document.title = prevTitle;
    };
  }, [title, description, image]);

  return null;
}
