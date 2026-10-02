import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup-runtime.ts"],
    env: { NEXT_PUBLIC_DEMO_ANCHOR_DATE: "2026-10-05", GEMINI_API_KEY: "" },
  },
});
