import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
  },
  server: {
    port: 5173,
    host: true,
  },
});
