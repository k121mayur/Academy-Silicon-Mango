import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split heavy, independent libraries into their own long-cached chunks so
        // they download only on the routes that use them and never invalidate the
        // app shell when product code changes.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory")) return "charts";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("pdfjs-dist")) return "pdf";
          if (id.includes("hls.js")) return "hls";
          if (id.includes("qrcode")) return "qrcode";
          if (id.includes("react-router") || id.includes("@remix-run")) return "router";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8085",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:8085",
        changeOrigin: true,
      },
    },
  },
});
