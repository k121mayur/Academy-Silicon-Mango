import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "react-hot-toast";

import "./index.css";
import { API_BASE_URL } from "@/lib/api";
import { APP_CACHE_VERSION, persister, queryClient, shouldPersistQuery } from "@/lib/queryClient";
import { useAuthStore } from "@/features/auth/stores/authStore";
import App from "./App";

// Drop any cached/persisted data the moment a session ends so one user's data
// never bleeds into the next login.
if (typeof window !== "undefined") {
  window.addEventListener("auth:logout", () => {
    queryClient.clear();
  });
}

function Root() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isInitialized) {
      fetchMe();
    }
  }, [fetchMe, isInitialized]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
      <Toaster
        position="top-right"
        toastOptions={{
          className:
            "!bg-surface-lowest !text-ink !text-body-sm !shadow-card !border !border-ink-outlineVariant/40",
          duration: 4000,
        }}
      />
    </BrowserRouter>
  );
}

console.log("[BOOT] Silicon Mango Academy frontend booting…");
console.log(`[BOOT] API base: ${API_BASE_URL || "same-origin"}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: persister!,
        maxAge: 24 * 60 * 60 * 1000,
        buster: APP_CACHE_VERSION,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <Root />
    </PersistQueryClientProvider>
  </StrictMode>
);
