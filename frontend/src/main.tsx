import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import "./index.css";
import { API_BASE_URL } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/features/auth/stores/authStore";
import App from "./App";

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
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>
);
