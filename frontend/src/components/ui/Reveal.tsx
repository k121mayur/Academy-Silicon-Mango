import { ElementType, HTMLAttributes } from "react";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

interface Props extends HTMLAttributes<HTMLElement> {
  /** Stagger delay in ms — pass `index * 60` inside a mapped list. */
  delay?: number;
  /** Reveal every time it enters the viewport instead of once. */
  repeat?: boolean;
  /** Render as a different element (defaults to div). */
  as?: ElementType;
}

/**
 * Wraps children in a scroll-revealed container. Hidden until it scrolls into
 * view, then fades + lifts in via CSS (see `[data-reveal]` in index.css).
 *
 *   <Reveal delay={i * 60}><Card /></Reveal>
 */
export function Reveal({ delay = 0, repeat = false, as, className, children, ...rest }: Props) {
  const ref = useReveal<HTMLElement>({ delay, once: !repeat });
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag ref={ref} data-reveal="" className={cn(className)} {...rest}>
      {children}
    </Tag>
  );
}
