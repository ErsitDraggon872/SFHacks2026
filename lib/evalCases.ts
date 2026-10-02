/**
 * Extractor eval set: shared by the oracle test (tests/eval-cases.test.ts) and the live runner
 * (scripts/eval-extractor.ts). OWNER: C1.
 */
import casesJson from "@/data/eval/cases.json";
import { resolveWhen } from "./normalize";
import { emptyDraft } from "./sanitize";
import { SAFETY_FIELDS, type EventDraft, type SafetyField } from "./types";

export interface EvalCase {
  id: string;
  category: "plain" | "permit" | "escalate" | "clarify" | "adversarial";
  clubId: string;
  text: string;
  /** Only the fields that matter for this case. Safety fields not listed are "unstated". */
  expect: Partial<EventDraft>;
  expectTier: 1 | 2 | 3;
  note: string;
}

export const EVAL_CASES = casesJson as EvalCase[];

/** The draft a perfect extractor would return for this case. */
export function oracleDraft(c: EvalCase): EventDraft {
  return { ...emptyDraft(), ...c.expect };
}

export interface FieldMiss {
  field: string;
  expected: unknown;
  got: unknown;
}

/** Compare an extracted draft against a case's expectations. Times are compared after resolution. */
export function compareDraft(c: EvalCase, got: EventDraft): FieldMiss[] {
  const misses: FieldMiss[] = [];
  for (const [field, expected] of Object.entries(c.expect)) {
    if (field === "whenPhrase") {
      const want = when(expected as string | null);
      const have = when(got.whenPhrase);
      if (JSON.stringify(want) !== JSON.stringify(have)) misses.push({ field: "when", expected: want, got: have });
    } else if (field === "avNeeds") {
      const want = [...(expected as string[])].sort();
      const have: string[] = [...got.avNeeds].sort();
      if (!want.every((x) => have.includes(x))) misses.push({ field, expected: want, got: have });
    } else if (JSON.stringify(expected) !== JSON.stringify(got[field as keyof EventDraft])) {
      misses.push({ field, expected, got: got[field as keyof EventDraft] });
    }
  }
  return misses;
}

/**
 * Unsafe = the extractor said "no" where the truth is "yes" or "not stated". An AI "no" skips
 * the officer's attestation, so these are the only misses that could let a risky event through.
 */
export function unsafeMisses(c: EvalCase, got: EventDraft): FieldMiss[] {
  return SAFETY_FIELDS.filter((k: SafetyField) => got[k] === false && c.expect[k] !== false).map((k) => ({
    field: k,
    expected: k in c.expect ? c.expect[k] : "unstated",
    got: false,
  }));
}

function when(phrase: string | null) {
  if (!phrase) return null;
  const r = resolveWhen(phrase);
  return "ambiguity" in r ? "ambiguous" : `${r.date} ${r.startTime}-${r.endTime}`;
}
