// Each test file gets its own throwaway store, so parallel files can't reseed or overwrite each
// other's data (and nothing touches data/runtime). Runs before the file's imports read the env.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SWAMPRESERVE_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "swampreserve-vitest-"));
