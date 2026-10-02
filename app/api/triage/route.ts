/**
 * POST /api/triage — OWNER: C3.
 * Presets: served from data/demo-cache.json (or live when key is present), through the deterministic pipeline.
 * Free text: calls extractEvent() and writeExplanation() from lib/llm.ts.
 */
import demoCache from "@/data/demo-cache.json";
import { readCollection } from "@/lib/db";
import { extractEvent, writeExplanation } from "@/lib/llm";
import { assemble, decide, prepare } from "@/lib/triagePipeline";
import type { AiMode, Booking, EventDraft, PresetId, TriageRequest, WriterOutput } from "@/lib/types";

type CacheEntry = { input: string; clubId: string; expectedTier?: number; draft: EventDraft; writer: WriterOutput | null };
const CACHE = demoCache as unknown as Record<PresetId, CacheEntry>;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TriageRequest | null;
  if (!body?.clubId) return Response.json({ error: "clubId is required" }, { status: 400 });

  const bookings = readCollection<Booking>("bookings");

  if (body.presetId) {
    const entry = CACHE[body.presetId];
    if (!entry) return Response.json({ error: `Unknown preset ${body.presetId}` }, { status: 400 });

    let draft: EventDraft = entry.draft;
    let writer: WriterOutput | null = entry.writer;
    let aiMode: AiMode = "fallback";

    // If API key is present, attempt live extraction on preset text
    if (process.env.GEMINI_API_KEY) {
      try {
        const liveExtract = await extractEvent(entry.input);
        if (liveExtract.aiMode === "live") {
          draft = liveExtract.draft;
          aiMode = "live";
        }
      } catch (err) {
        console.warn("Live preset extraction failed, using cache:", err);
      }
    }

    const { draft: preparedDraft, facts } = prepare(draft, entry.input);
    const decision = decide(facts, bookings, body.clubId, body.attested ?? false);

    if (aiMode === "live" && decision.tier > 1) {
      try {
        writer = await writeExplanation(facts, decision);
      } catch (err) {
        console.warn("Live preset writer failed, using cache writer:", err);
        writer = entry.writer;
      }
    }

    return Response.json(
      assemble({
        requestText: entry.input,
        presetId: body.presetId,
        draft: preparedDraft,
        facts,
        decision,
        writer,
        bookings,
        aiMode,
      }),
    );
  }

  if (body.text?.trim()) {
    const text = body.text.trim();
    const { draft, aiMode } = await extractEvent(text);
    const { draft: preparedDraft, facts } = prepare(draft, text);
    const decision = decide(facts, bookings, body.clubId, body.attested ?? false);
    const writer = decision.tier > 1 ? await writeExplanation(facts, decision) : null;

    return Response.json(
      assemble({
        requestText: text,
        presetId: null,
        draft: preparedDraft,
        facts,
        decision,
        writer,
        bookings,
        aiMode,
      }),
    );
  }

  return Response.json({ error: "Provide text or presetId" }, { status: 400 });
}

