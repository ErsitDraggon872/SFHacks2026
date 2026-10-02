/**
 * Generates fixtures/triage-*.json from data/demo-cache.json (drafts + writer outputs) run through
 * the REAL deterministic pipeline, so fixtures can never drift from policy.ts.
 * Run: npm run fixtures. OWNER: C1.
 */
import fs from "node:fs";
import path from "node:path";
import seedBookings from "../data/bookings.seed.json";
import demoCache from "../data/demo-cache.json";
import { setFact } from "../lib/normalize";
import { assemble, decide, prepare } from "../lib/triagePipeline";
import type { Booking, EventDraft, EventFacts, PresetId, TriageResponse, WriterOutput } from "../lib/types";

type CacheEntry = { input: string; clubId: string; expectedTier: 1 | 2 | 3; draft: EventDraft; writer: WriterOutput | null };
const cache = demoCache as unknown as Record<PresetId, CacheEntry>;
const bookings = seedBookings as Booking[];

function build(id: PresetId, override?: (f: EventFacts) => EventFacts): TriageResponse {
  const entry = cache[id];
  const prepared = prepare(entry.draft, entry.input);
  const facts = override ? override(prepared.facts) : prepared.facts;
  const decision = decide(facts, bookings, entry.clubId);
  return assemble({
    requestText: entry.input,
    presetId: id,
    draft: prepared.draft,
    facts,
    decision,
    writer: entry.writer,
    bookings,
    aiMode: "fallback",
  });
}

const dir = path.join(process.cwd(), "fixtures");
fs.mkdirSync(dir, { recursive: true });
const out: Record<string, TriageResponse> = {
  study: build("study"),
  pizza: build("pizza"),
  speaker: build("speaker"),
  dance: build("dance"),
};
// the hero demo right after the officer clicks "Fix It"
out["pizza-fixed"] = build("pizza", (f) => setFact(f, "requestedRoomId", out.pizza.decision.suggestedRoomId));

let failed = false;
for (const [name, t] of Object.entries(out)) {
  fs.writeFileSync(path.join(dir, `triage-${name}.json`), JSON.stringify(t, null, 2) + "\n");
  const d = t.decision;
  const expected = cache[(t.presetId ?? name) as PresetId].expectedTier;
  if (d.tier !== expected) failed = true;
  console.log(`${d.tier === expected ? "✓" : "✗"} ${name.padEnd(12)} tier=${d.tier} target=${d.targetRoomId} suggested=${d.suggestedRoomId ?? "-"} → ${d.headline}`);
}
if (failed) {
  console.error("A preset no longer lands on its expected tier.");
  process.exit(1);
}
