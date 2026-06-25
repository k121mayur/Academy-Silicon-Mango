import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Google Analytics 4 — single-page-app page-view tracking.
 *
 * The gtag.js loader + initial `config` call live in index.html, so the first
 * page load is already counted there. This component fires a `page_view` on
 * every subsequent client-side route change (React Router never reloads the
 * document, so GA would otherwise see only the landing URL). The very first
 * render is skipped to avoid double-counting the initial load.
 *
 * Safe no-op if gtag is unavailable (ad-blocker, offline, or CSP block).
 */

export const GA_MEASUREMENT_ID = "G-3T4XZ0H6NH";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function Analytics() {
  const { pathname, search } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (typeof window.gtag !== "function") return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.gtag("event", "page_view", {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}
