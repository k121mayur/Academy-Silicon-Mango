import { ImgHTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  /** Wrapper className (the wrapper carries the placeholder tint + aspect box). */
  wrapperClassName?: string;
  /** Image fit mode: 'cover' (default) or 'contain' (zero-crop). */
  fit?: "cover" | "contain";
  /** If true, renders a subtle blurred copy of the image underneath to seamlessly fill letterboxed areas. */
  ambient?: boolean;
}

/**
 * Network-friendly image: native lazy-loading + async decoding so off-screen
 * images never block first paint, and a soft fade-in once decoded so slow
 * connections don't pop. Falls back gracefully if the image errors.
 *
 * Always pass meaningful `alt` text (decorative images: `alt=""`).
 */
export function Img({
  className,
  wrapperClassName,
  alt = "",
  fit = "cover",
  ambient = false,
  onLoad,
  src,
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <span className={cn("relative block overflow-hidden bg-surface-container", wrapperClassName)}>
      {!errored && src && ambient && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover blur-lg scale-110 opacity-30 pointer-events-none select-none"
        />
      )}
      {!errored && (
        <img
          {...rest}
          src={src}
          alt={alt}
          loading={rest.loading ?? "lazy"}
          decoding={rest.decoding ?? "async"}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={() => setErrored(true)}
          className={cn(
            "h-full w-full transition-[opacity,filter] duration-500 ease-out",
            fit === "contain" ? "object-contain relative z-[1]" : "object-cover",
            loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm",
            className
          )}
        />
      )}
    </span>
  );
}
