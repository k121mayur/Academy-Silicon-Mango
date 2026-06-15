import { ImgHTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  /** Wrapper className (the wrapper carries the placeholder tint + aspect box). */
  wrapperClassName?: string;
}

/**
 * Network-friendly image: native lazy-loading + async decoding so off-screen
 * images never block first paint, and a soft fade-in once decoded so slow
 * connections don't pop. Falls back gracefully if the image errors.
 *
 * Always pass meaningful `alt` text (decorative images: `alt=""`).
 */
export function Img({ className, wrapperClassName, alt = "", onLoad, ...rest }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <span className={cn("block overflow-hidden bg-surface-container", wrapperClassName)}>
      {!errored && (
        <img
          {...rest}
          alt={alt}
          loading={rest.loading ?? "lazy"}
          decoding={rest.decoding ?? "async"}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={() => setErrored(true)}
          className={cn(
            "h-full w-full object-cover transition-[opacity,filter] duration-500 ease-out",
            loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm",
            className
          )}
        />
      )}
    </span>
  );
}
