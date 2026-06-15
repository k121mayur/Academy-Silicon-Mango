import { useEffect, useRef } from "react";

interface Options {
  /** Fraction of the element visible before it reveals (0–1). */
  amount?: number;
  /** Reveal only once, then stop observing (default true). */
  once?: boolean;
  /** Stagger delay in ms, applied via the --reveal-delay CSS variable. */
  delay?: number;
}

/**
 * Dependency-free scroll-reveal driven by IntersectionObserver.
 *
 * The element starts with `data-reveal` (hidden, styled in index.css) and flips
 * to `data-reveal="in"` when it enters the viewport. No JS animation runs on the
 * main thread — the transition is pure CSS (transform + opacity, GPU-friendly),
 * which keeps it smooth on low-end devices and under load. `prefers-reduced-motion`
 * is honoured globally, so reduced-motion users simply see content already visible.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options: Options = {}) {
  const { amount = 0.15, once = true, delay = 0 } = options;
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (delay) el.style.setProperty("--reveal-delay", `${delay}ms`);

    // No IntersectionObserver (or reduced motion handled by CSS) → show immediately.
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.reveal = "in";
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "in";
            if (once) io.unobserve(el);
          } else if (!once) {
            el.dataset.reveal = "";
          }
        }
      },
      { threshold: amount, rootMargin: "0px 0px -8% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [amount, once, delay]);

  return ref;
}
