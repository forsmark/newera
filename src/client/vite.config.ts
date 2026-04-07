/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist",
  },
  server: {
    // Dev proxy — only works when Vite runs on the host machine (not inside Docker)
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        timeout: 300_000,      // 5 min — cover letter generation via Ollama is slow
        proxyTimeout: 300_000,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    globals: true,
  },
});
