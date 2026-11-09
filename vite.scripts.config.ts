import { defineConfig } from "vite";

// Content script, service worker and offscreen page can't share ES-module chunks, so each is its own IIFE build.
// Pick one with --mode (see the "build" script).
const entries = {
  content: "src/content/entry.ts",
  background: "src/background/index.ts",
  offscreen: "src/offscreen/index.ts",
  page: "src/page/entry.ts",
} as const;

export default defineConfig(({ mode }) => {
  const name = mode as keyof typeof entries;
  return {
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: { entry: entries[name], formats: ["iife"], name: `wst_${name}`, fileName: () => `${name}.js` },
    },
  };
});
