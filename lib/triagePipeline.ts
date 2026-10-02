/**
 * Shared deterministic pipeline used by /api/triage and the fixture builder. OWNER: C1.
 * C3 supplies the draft (LLM extractor) and writer (LLM writer); everything between is code.
 */
import { ROOMS } from "./data";
import { draftToFacts, findWhenPhrase, whenAmbiguity } from "./normalize";
import { evaluate } from "./policy";
import { rankRooms } from "./rank";
import { requireNegationEvidence, sanitizeDraft } from "./sanitize";
import { isImpliedNo, type AiMode, type Booking, type EventDraft, type EventFacts, type PolicyDecision, type PresetId, type TriageResponse, type WriterOutput } from "./types";

/**
 * Step 1: draft → facts. Accepts raw extractor output: it is sanitized first (lib/sanitize.ts),
 * any AI "no" the text doesn't back up becomes unknown, then the time-phrase ambiguity, if any,
 * is added to the draft.
 */
export function prepare(raw: unknown, text: string | null): { draft: EventDraft; facts: EventFacts } {
  const guarded = requireNegationEvidence(sanitizeDraft(raw).draft, text).draft;
  // alcohol / weapons are taken as "no" unless stated, so the AI's questions about them are dropped
  const draft = {
    ...guarded,
    // no time phrase extracted (offline extractor, or a model miss): look for one in the text itself
    whenPhrase: guarded.whenPhrase ?? (text ? findWhenPhrase(text) : null),
    ambiguities: guarded.ambiguities.filter((a) => !isImpliedNo(a.field)),
  };
  const amb = whenAmbiguity(draft);
  const full = amb ? { ...draft, ambiguities: [...draft.ambiguities, { field: amb.field, question: amb.ambiguity }] } : draft;
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
