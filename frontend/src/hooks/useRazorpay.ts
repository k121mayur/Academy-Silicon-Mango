import { useCallback, useState } from "react";

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const SCRIPT_ID = "razorpay-checkout-js";
const LOAD_TIMEOUT_MS = 10_000;

type Status = "idle" | "loading" | "ready" | "error";

// Module-level singleton so concurrent mounts share one <script> injection.
let loadPromise: Promise<void> | null = null;

function injectScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupDeadScript(script);
      loadPromise = null;
      reject(new Error("Razorpay checkout took too long to load."));
    }, LOAD_TIMEOUT_MS);

    script.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      cleanupDeadScript(script);
      loadPromise = null;
      reject(new Error("Couldn't load the secure checkout. Check your connection."));
    };

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return loadPromise;
}

function cleanupDeadScript(script: HTMLScriptElement) {
  // Remove the dead node so a retry can re-inject a fresh one.
  try {
    script.parentNode?.removeChild(script);
  } catch {
    /* noop */
  }
}

export function useRazorpay() {
  const [status, setStatus] = useState<Status>(() =>
    typeof window !== "undefined" && window.Razorpay ? "ready" : "idle"
  );

  const load = useCallback(async () => {
    if (typeof window !== "undefined" && window.Razorpay) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      await injectScript();
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      throw e;
    }
  }, []);

  return { status, load };
}
