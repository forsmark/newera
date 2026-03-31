import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../../dist",
  },
  server: {
    // Dev proxy — only works when Vite runs on the host machine (not inside Docker)
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
