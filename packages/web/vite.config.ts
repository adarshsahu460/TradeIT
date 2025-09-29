import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { PluginOption } from "vite";
import type { UserConfig as VitestUserConfig } from "vitest/config";

const API_PROXY_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:4000";

const config: VitestUserConfig = {
  plugins: [react() as unknown as PluginOption],
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    css: true,
  },
};

export default defineConfig(config);
