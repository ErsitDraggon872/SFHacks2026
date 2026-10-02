/**
 * File-backed JSON store over data/runtime/*.json. SERVER-ONLY. OWNER: C1.
 * All reads/writes are synchronous, so a read → validate → write sequence in one request
 * can't interleave with another request in the single Node process.
 */
import fs from "node:fs";
import path from "node:path";

const RUNTIME = path.join(process.cwd(), "data", "runtime");
const SEEDS: Record<string, string> = {
  bookings: path.join(process.cwd(), "data", "bookings.seed.json"),
};

export type Collection = "bookings" | "snapshots";

function file(name: Collection) {
  return path.join(RUNTIME, `${name}.json`);
}

/** Copy seed data into data/runtime (used on first read and by `npm run demo:reset`). */
export function resetCollection(name: Collection) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const seed = SEEDS[name];
  fs.writeFileSync(file(name), seed && fs.existsSync(seed) ? fs.readFileSync(seed, "utf8") : "[]\n");
}

export function readCollection<T>(name: Collection): T[] {
  if (!fs.existsSync(file(name))) resetCollection(name);
  return JSON.parse(fs.readFileSync(file(name), "utf8")) as T[];
}

export function writeCollection<T>(name: Collection, rows: T[]) {
  fs.mkdirSync(RUNTIME, { recursive: true });
  const tmp = `${file(name)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2) + "\n");
  fs.renameSync(tmp, file(name));
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
