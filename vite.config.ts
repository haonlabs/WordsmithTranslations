import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Popup build. Content script is built separately (vite.content.config.ts) because
// content scripts cannot load ES-module chunks.
export default defineConfig({
  root: "src/popup",
  base: "",
  publicDir: "../../public",
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
});
