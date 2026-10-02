/**
 * POST /api/triage — OWNER: C3 (C1 wrote this working stub).
 * Presets: served from data/demo-cache.json through the real deterministic pipeline.
 * Free text: TODO(C3) — call extractEvent() / writeExplanation() from lib/llm.ts, keep the shapes.
 */
import demoCache from "@/data/demo-cache.json";
import type { Booking, EventDraft, PresetId, TriageRequest, WriterOutput } from "@/lib/types";
import { readCollection } from "@/lib/db";
import { assemble, decide, prepare } from "@/lib/triagePipeline";

type CacheEntry = { input: string; clubId: string; draft: EventDraft; writer: WriterOutput | null };
const CACHE = demoCache as unknown as Record<PresetId, CacheEntry>;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TriageRequest | null;
  if (!body?.clubId) return Response.json({ error: "clubId is required" }, { status: 400 });

  const bookings = readCollection<Booking>("bookings");

  if (body.presetId) {
    const entry = CACHE[body.presetId];
    if (!entry) return Response.json({ error: `Unknown preset ${body.presetId}` }, { status: 400 });
    const { draft, facts } = prepare(entry.draft, entry.input);
    const decision = decide(facts, bookings, body.clubId, body.attested ?? false);
    return Response.json(
      assemble({ requestText: entry.input, presetId: body.presetId, draft, facts, decision, writer: entry.writer, bookings, aiMode: "fallback" }),
    );
  }

  if (body.text?.trim()) {
    // TODO(C3): const { draft, aiMode } = await extractEvent(body.text) → prepare → decide →
    //           writer = tier > 1 ? await writeExplanation(facts, decision) : null → assemble
    return Response.json(
      { error: "Free-text understanding isn't connected yet. Try an example or the Filters tab." },
      { status: 501 },
    );
  }

  return Response.json({ error: "Provide text or presetId" }, { status: 400 });
}
