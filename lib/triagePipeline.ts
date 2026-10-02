/**
 * Shared deterministic pipeline used by /api/triage and the fixture builder. OWNER: C1.
 * C3 supplies the draft (LLM extractor) and writer (LLM writer); everything between is code.
 */
import { ROOMS } from "./data";
import { draftToFacts, whenAmbiguity } from "./normalize";
import { evaluate } from "./policy";
import { rankRooms } from "./rank";
import { sanitizeDraft } from "./sanitize";
import type { AiMode, Booking, EventDraft, EventFacts, PolicyDecision, PresetId, TriageResponse, WriterOutput } from "./types";

/**
 * Step 1: draft → facts. Accepts raw extractor output: it is sanitized first (lib/sanitize.ts),
 * then the time-phrase ambiguity, if any, is added to the draft.
 */
export function prepare(raw: unknown, text: string | null): { draft: EventDraft; facts: EventFacts } {
  const { draft } = sanitizeDraft(raw);
  const amb = whenAmbiguity(draft);
  const full = amb ? { ...draft, ambiguities: [...draft.ambiguities, { field: "date" as const, question: amb }] } : draft;
  return { draft: full, facts: draftToFacts(full, { text: text ?? undefined }) };
}

/** Step 2: facts → decision. The writer (if any) runs after this, on the decision. */
export function decide(facts: EventFacts, bookings: Booking[], clubId: string, attested = false): PolicyDecision {
  return evaluate(facts, { rooms: ROOMS, bookings, clubId, attested });
}

/** Step 3: assemble the response. */
export function assemble(args: {
  requestText: string | null;
  presetId: PresetId | null;
  draft: EventDraft | null;
  facts: EventFacts;
  decision: PolicyDecision;
  writer: WriterOutput | null;
  bookings: Booking[];
  aiMode: AiMode;
}): TriageResponse {
  const { facts, decision } = args;
  return {
    requestText: args.requestText,
    presetId: args.presetId,
    draft: args.draft,
    facts,
    decision,
    ranked: rankRooms(facts, decision, ROOMS),
    writer: decision.tier === 1 ? null : args.writer,
    bookingsForDate: args.bookings.filter((b) => b.date === facts.date.value),
    aiMode: args.aiMode,
  };
}
