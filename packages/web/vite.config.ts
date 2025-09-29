import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PROXY_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:4000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      "/health": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});
