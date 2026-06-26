import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Google Analytics 4 — single-page-app page-view tracking.
 *
 * The measurement ID comes from VITE_GA_MEASUREMENT_ID (NOT hardcoded), so dev /
 * staging don't pollute the production property and the ID can change without a
 * code edit. When the env var is unset (e.g. local dev), GA never loads — this
 * component becomes a no-op, same idea as the Turnstile gate.
 *
 * On mount it injects gtag.js once and fires the initial `config` (which counts
 * the first page). Every subsequent client-side route change fires a `page_view`
 * (React Router never reloads the document). Safe no-op if gtag is unavailable
 * (ad-blocker, offline, or CSP block).
 */

export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
export const GA_ENABLED = !!GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let bootstrapped = false;
function bootstrapGtag(id: string) {
  if (bootstrapped || typeof window === "undefined" || typeof document === "undefined") return;
  bootstrapped = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  // Canonical gtag shim — must push the `arguments` object itself, not an array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id); // counts the initial page load
}

export function Analytics() {
  const { pathname, search } = useLocation();
  const isFirstRender = useRef(true);

  // Load GA once, only when an ID is configured for this environment.
  useEffect(() => {
    if (GA_MEASUREMENT_ID) bootstrapGtag(GA_MEASUREMENT_ID);
  }, []);

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
