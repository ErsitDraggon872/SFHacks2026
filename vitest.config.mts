import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that hit the file-backed store get a fresh throwaway directory, never data/runtime.
const runtimeDir = path.join(os.tmpdir(), "gatorspace-vitest-runtime");
fs.rmSync(runtimeDir, { recursive: true, force: true });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { NEXT_PUBLIC_DEMO_ANCHOR_DATE: "2026-10-05", GATORSPACE_RUNTIME_DIR: runtimeDir, GEMINI_API_KEY: "" },
  },
});
