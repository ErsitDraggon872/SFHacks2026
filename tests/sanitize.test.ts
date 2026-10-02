import { describe, expect, it } from "vitest";
import demoCache from "@/data/demo-cache.json";
import { emptyDraft, matchBuilding, sanitizeDraft, UNREADABLE_QUESTION } from "@/lib/sanitize";
import { decide, prepare } from "@/lib/triagePipeline";
import type { PresetId } from "@/lib/types";

const clean = (raw: Record<string, unknown>) => sanitizeDraft({ ...emptyDraft(), ...raw });

describe("sanitizeDraft", () => {
  it.each(["study", "pizza", "speaker", "dance"] as PresetId[])("passes the %s demo draft through unchanged", (id) => {
    const draft = (demoCache as unknown as Record<PresetId, { draft: unknown }>)[id].draft;
    const res = sanitizeDraft(draft);
    expect(res.issues).toEqual([]);
    expect(res.draft).toEqual(draft);
  });

  it.each([null, undefined, "pizza party", 42, ["a"]])("turns non-object input %j into an all-unknown draft with one question", (raw) => {
    const { draft, issues } = sanitizeDraft(raw);
    expect(draft).toEqual({ ...emptyDraft(), ambiguities: [{ field: null, question: UNREADABLE_QUESTION }] });
    expect(issues).toHaveLength(1);
  });

  it("fills missing keys with unknowns", () => {
    expect(sanitizeDraft({}).draft).toEqual(emptyDraft());
  });

  describe("headcount", () => {
    it.each([
      [45, 45],
      ["45", 45],
      [" 12 ", 12],
      [2000, 2000],
    ])("%j → %j", (input, out) => expect(clean({ headcount: input }).draft.headcount).toBe(out));

    it.each([0, -3, 2001, 40.5, "40ish", "about 40", "", NaN, Infinity, true, {}])("%j → null (engine asks)", (input) => {
      expect(clean({ headcount: input }).draft.headcount).toBeNull();
    });
  });

  describe("tri-state fields", () => {
    it.each([
      [true, true],
      [false, false],
      [null, null],
      ["yes", true],
      ["TRUE", true],
      ["no", false],
      ["false", false],
    ])("%j → %j", (input, out) => expect(clean({ alcohol: input }).draft.alcohol).toBe(out));

    it.each(["maybe", "probably not", "unknown", 1, 0, [], {}])("unclear %j → null, never a guess", (input) => {
      const { draft, issues } = clean({ minors: input });
      expect(draft.minors).toBeNull();
      expect(issues.some((i) => i.startsWith("minors"))).toBe(true);
    });

    it("applies to every safety field", () => {
      const { draft } = clean({ food: "yes", amplifiedSound: "no", externalGuests: "maybe", guestSpeakers: 1, alcohol: "true", minors: "false" });
      expect([draft.food, draft.amplifiedSound, draft.externalGuests, draft.guestSpeakers, draft.alcohol, draft.minors]).toEqual([true, false, null, null, true, false]);
    });
  });

  it("strings are trimmed, blanks become null, long values are capped", () => {
    const { draft } = clean({ summary: "  Coding night  ", foodDescription: "   ", whenPhrase: "x".repeat(500) });
    expect(draft.summary).toBe("Coding night");
    expect(draft.foodDescription).toBeNull();
    expect(draft.whenPhrase).toHaveLength(200);
    expect(clean({ summary: 7 }).draft.summary).toBeNull();
  });

  it("avNeeds keeps known items, maps common synonyms, dedupes, drops the rest", () => {
    const { draft, issues } = clean({ avNeeds: ["projector", "Mics", "microphone", "TV", "zoom", "video conf", "fog machine", 3] });
    expect(draft.avNeeds).toEqual(["projector", "microphone", "display", "video_conf"]);
    expect(issues.filter((i) => i.startsWith("avNeeds"))).toHaveLength(2);
    expect(clean({ avNeeds: "projector" }).draft.avNeeds).toEqual([]);
  });

  it("layout and room-type hints are limited to known values", () => {
    const { draft } = clean({ layout: "banquet", roomTypeHints: ["lab", "ballroom"] });
    expect(draft.layout).toBeNull();
    expect(draft.roomTypeHints).toEqual(["lab"]);
    expect(clean({ layout: "seminar" }).draft.layout).toBe("seminar");
  });

  it("missingRequiredFields and ambiguities are validated and capped", () => {
    const { draft } = clean({
      missingRequiredFields: ["headcount", "headcount", "vibe"],
      ambiguities: [
        { field: "date", question: " Which Thursday? " },
        { field: "vibe", question: "Chill?" },
        { field: "date", question: "" },
        "not an object",
        ...Array.from({ length: 6 }, (_, i) => ({ field: null, question: `Q${i}` })),
      ],
    });
    expect(draft.missingRequiredFields).toEqual(["headcount"]);
    expect(draft.ambiguities.slice(0, 2)).toEqual([
      { field: "date", question: "Which Thursday?" },
      { field: null, question: "Chill?" },
    ]);
    expect(draft.ambiguities).toHaveLength(5);
  });

  it("drops unknown keys (e.g. a model trying to set its own tier)", () => {
    const { draft, issues } = clean({ tier: 1, canAutoApprove: true });
    expect(draft).not.toHaveProperty("tier");
    expect(draft).not.toHaveProperty("canAutoApprove");
    expect(issues).toEqual(["tier: unknown field dropped", "canAutoApprove: unknown field dropped"]);
  });
});

describe("matchBuilding", () => {
  it.each([
    ["Thornton Hall", "Thornton Hall"],
    ["thornton", "Thornton Hall"],
    ["TH", "Thornton Hall"],
    ["the library", "J. Paul Leonard Library"],
    ["Student Center", "Cesar Chavez Student Center"],
    ["CCSC", "Cesar Chavez Student Center"],
    ["the Village", "Village at Centennial Square"],
    ["gym", "Gymnasium"],
    ["Business", "Business Building"],
    ["in Thornton Hall 326", "Thornton Hall"],
  ])("%j → %j", (input, out) => expect(matchBuilding(input)).toBe(out));

  it.each(["Hogwarts", "", "Hall", "Building"])("%j → null (unknown or ambiguous)", (input) => {
    expect(matchBuilding(input)).toBeNull();
  });
});

describe("prepare() guards the engine", () => {
  it("a garbage extractor response becomes a Tier 2 'needs info' decision instead of throwing", () => {
    const { draft, facts } = prepare({ headcount: "lots", food: "idk", avNeeds: "all of it", tier: 1 }, "some text");
    expect(draft.ambiguities).toEqual([]);
    const d = decide(facts, [], "acm");
    expect(d.tier).toBe(2);
    expect(d.needsInfo).toBe(true);
    expect(d.canSubmit).toBe(false);
  });

  it("a non-object response asks the officer to restate the request", () => {
    const { draft, facts } = prepare("Sorry, I can't help with that.", null);
    expect(draft.ambiguities[0].question).toBe(UNREADABLE_QUESTION);
    expect(decide(facts, [], "acm").canSubmit).toBe(false);
  });

  it("a fuzzy building name still targets that building", () => {
    const { facts } = prepare({ ...emptyDraft(), headcount: 20, whenPhrase: "Thursday 2-4pm", preferredBuilding: "thornton" }, null);
    expect(facts.preferredBuilding.value).toBe("Thornton Hall");
    expect(decide(facts, [], "acm").targetRoomId?.startsWith("TH-")).toBe(true);
  });
});
