/**
 * Live extractor eval: runs data/eval/cases.json through lib/llm.ts extractEvent() + the real engine.
 * Run: npm run eval            (prints a table)
 *      npm run eval -- --write (also saves docs/eval-results.md)
 * Needs GEMINI_API_KEY (read from .env.local if present). OWNER: C1.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import seedBookings from "../data/bookings.seed.json";
import { compareDraft, EVAL_CASES, unsafeMisses, type EvalCase, type FieldMiss } from "../lib/evalCases";
import { decide, prepare } from "../lib/triagePipeline";
import type { Booking, EventDraft } from "../lib/types";

type Extract = (text: string) => Promise<{ draft: unknown; aiMode: "live" | "fallback" }>;
type Row = { c: EvalCase; status: "pass" | "safe-miss" | "unsafe" | "skipped" | "error"; tier: number | null; misses: FieldMiss[]; unsafe: FieldMiss[]; detail?: string };

const SPACING_MS = 4000; // stay under free-tier requests/minute
const root = process.cwd();

async function loadExtractor(): Promise<Extract | null> {
  const file = path.join(root, "lib", "llm.ts");
  if (!fs.existsSync(file)) return null;
  const mod = (await import(pathToFileURL(file).href)) as { extractEvent?: Extract };
  return mod.extractEvent ?? null;
}

async function evalCase(extract: Extract, c: EvalCase): Promise<Row> {
  try {
    const { draft: raw, aiMode } = await extract(c.text);
    if (aiMode !== "live") return { c, status: "skipped", tier: null, misses: [], unsafe: [], detail: "fallback (not live)" };
    const { draft, facts } = prepare(raw, c.text);
    const tier = decide(facts, seedBookings as Booking[], c.clubId).tier;
    const misses = compareDraft(c, draft as EventDraft);
    const unsafe = unsafeMisses(c, draft as EventDraft);
    if (tier !== c.expectTier) misses.push({ field: "tier", expected: c.expectTier, got: tier });
    // a lower tier than expected means something risky could be approved too easily
    if (tier < c.expectTier) unsafe.push({ field: "tier", expected: c.expectTier, got: tier });
    const status = unsafe.length ? "unsafe" : misses.length ? "safe-miss" : "pass";
    return { c, status, tier, misses, unsafe };
  } catch (e) {
    return { c, status: "error", tier: null, misses: [], unsafe: [], detail: e instanceof Error ? e.message : String(e) };
  }
}

const fmt = (m: FieldMiss) => `${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}`;

function report(rows: Row[]): string {
  const count = (s: Row["status"]) => rows.filter((r) => r.status === s).length;
  const scored = rows.length - count("skipped") - count("error");
  const lines = [
    `# Extractor eval`,
    ``,
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · model \`${process.env.GEMINI_EXTRACTOR_MODEL ?? "default"}\` · ${EVAL_CASES.length} cases`,
    ``,
    `**${count("pass")}/${scored} exact · ${count("safe-miss")} safe misses · ${count("unsafe")} unsafe**` +
      (count("skipped") + count("error") ? ` · ${count("skipped")} skipped · ${count("error")} errors` : ""),
    ``,
    `A *safe miss* means the extractor got a detail wrong but the engine still asked or escalated. *Unsafe* means it answered "no" to a safety question that was "yes" or never stated (which skips the officer's attestation), or the request landed on a lower tier than it should have.`,
    ``,
    `| Case | Category | Expected tier | Got | Result | Notes |`,
    `|---|---|---|---|---|---|`,
    ...rows.map((r) =>
      `| ${r.c.id} | ${r.c.category} | ${r.c.expectTier} | ${r.tier ?? "–"} | ${r.status} | ${[...r.unsafe.map((m) => `**${fmt(m)}**`), ...r.misses.filter((m) => !r.unsafe.some((u) => u.field === m.field)).map(fmt), r.detail ?? ""].filter(Boolean).join("; ")} |`,
    ),
  ];
  return lines.join("\n") + "\n";
}

async function main() {
  const envFile = path.join(root, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const extract = await loadExtractor();
  if (!extract) {
    console.log("lib/llm.ts (extractEvent) isn't merged yet; nothing to evaluate.");
    return;
  }
  if (!process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is not set: every case will likely be skipped as fallback.");

  const rows: Row[] = [];
  for (const [i, c] of EVAL_CASES.entries()) {
    if (i) await new Promise((r) => setTimeout(r, SPACING_MS));
    const row = await evalCase(extract, c);
    rows.push(row);
    console.log(`${row.status.padEnd(9)} ${c.id}${row.misses.length ? `  (${row.misses.map((m) => m.field).join(", ")})` : ""}`);
  }
  const md = report(rows);
  console.log("\n" + md);
  if (process.argv.includes("--write")) {
    fs.writeFileSync(path.join(root, "docs", "eval-results.md"), md);
    console.log("Saved docs/eval-results.md");
  }
  if (rows.some((r) => r.status === "unsafe")) process.exitCode = 1;
}

main();
