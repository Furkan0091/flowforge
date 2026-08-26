import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In development the Vite server proxies API + WebSocket traffic to the
// backend so the browser talks to a single origin. Override the target with
// VITE_PROXY_TARGET (used in Docker) or point the app at a deployed API with
// VITE_API_URL at build time.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: false,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
