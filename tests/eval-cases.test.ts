/** Oracle check: a perfect extractor on each eval case must land on the case's expected tier. */
import { describe, expect, it } from "vitest";
import seedBookings from "@/data/bookings.seed.json";
import { compareDraft, EVAL_CASES, oracleDraft, unsafeMisses } from "@/lib/evalCases";
import { CLUB_BY_ID } from "@/lib/data";
import { sanitizeDraft } from "@/lib/sanitize";
import { decide, prepare } from "@/lib/triagePipeline";
import type { Booking } from "@/lib/types";

describe("eval cases", () => {
  it("ids are unique and clubs exist", () => {
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    for (const c of EVAL_CASES) expect(CLUB_BY_ID[c.clubId], c.id).toBeDefined();
  });

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))("%s: oracle draft is valid and lands on its expected tier", (_id, c) => {
    const draft = oracleDraft(c);
    expect(sanitizeDraft(draft).issues).toEqual([]);
    const { facts } = prepare(draft, c.text);
    expect(decide(facts, seedBookings as Booking[], c.clubId).tier).toBe(c.expectTier);
  });

  it("the oracle scores itself perfect", () => {
    for (const c of EVAL_CASES) {
      expect(compareDraft(c, oracleDraft(c)), c.id).toEqual([]);
      expect(unsafeMisses(c, oracleDraft(c)), c.id).toEqual([]);
    }
  });

  it("an extractor that says 'no' to unstated details is flagged unsafe", () => {
    const c = EVAL_CASES.find((x) => x.id === "adv-unstated")!;
    const lazy = { ...oracleDraft(c), food: false, externalGuests: false, alcohol: false };
    expect(unsafeMisses(c, lazy).map((m) => m.field)).toEqual(["food", "externalGuests", "alcohol"]);
  });
});
