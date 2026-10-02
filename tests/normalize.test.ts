import { describe, expect, it } from "vitest";
import { diffCorrections, draftToFacts, emptyFacts, resolveWhen, setFact } from "@/lib/normalize";
import type { EventDraft } from "@/lib/types";

const ANCHOR = "2026-10-05"; // Monday

describe("resolveWhen", () => {
  it('"Thursday 6-9pm" → 2026-10-08 18:00–21:00', () => {
    expect(resolveWhen("Thursday 6-9pm", ANCHOR)).toEqual({ date: "2026-10-08", startTime: "18:00", endTime: "21:00", durationMin: 180 });
  });

  it("accepts en/em dashes", () => {
    expect(resolveWhen("Thursday 6–9pm", ANCHOR)).toMatchObject({ date: "2026-10-08", startTime: "18:00", endTime: "21:00" });
  });

  it("uses the env anchor by default", () => {
    expect(resolveWhen("Thursday 6-9pm")).toMatchObject({ date: "2026-10-08" });
  });

  it('"Thursday from six to nine" → ambiguity (never guesses)', () => {
    expect(resolveWhen("Thursday from six to nine", ANCHOR)).toHaveProperty("ambiguity");
  });

  it("a day with no time → ambiguity", () => {
    expect(resolveWhen("Thursday", ANCHOR)).toHaveProperty("ambiguity");
  });

  it("a start with no end → asks for the end time, keeping the day and start", () => {
    expect(resolveWhen("Thursday at 6pm", ANCHOR)).toEqual({
      ambiguity: "What time does the event end?",
      field: "endTime",
      date: "2026-10-08",
      startTime: "18:00",
    });
  });

  it('a date with no time keeps the date: "october 10" → 2026-10-10, asks for the start', () => {
    expect(resolveWhen("october 10", ANCHOR)).toMatchObject({ field: "startTime", date: "2026-10-10" });
    expect(resolveWhen("Thursday", ANCHOR)).toMatchObject({ field: "startTime", date: "2026-10-08" });
  });

  it("a time with no day never guesses the day", () => {
    const r = resolveWhen("at 6pm", ANCHOR);
    expect(r).toMatchObject({ field: "date" });
    expect(r).not.toHaveProperty("date");
  });

  it("unparseable or empty text → ambiguity", () => {
    expect(resolveWhen("sometime soon-ish", ANCHOR)).toHaveProperty("ambiguity");
    expect(resolveWhen("   ", ANCHOR)).toHaveProperty("ambiguity");
  });

  it("rejects ranges longer than 6 hours", () => {
    expect(resolveWhen("Thursday 9am-5pm", ANCHOR)).toHaveProperty("ambiguity");
  });
});

const draft = (p: Partial<EventDraft> = {}): EventDraft => ({
  summary: "Study session",
  headcount: 8,
  whenPhrase: "Thursday 4-6pm",
  food: null,
  foodDescription: null,
  amplifiedSound: null,
  externalGuests: null,
  guestSpeakers: null,
  alcohol: null,
  minors: null,
  avNeeds: [],
  layout: null,
  roomTypeHints: [],
  preferredBuilding: null,
  missingRequiredFields: [],
  ambiguities: [],
  ...p,
});

describe("draftToFacts", () => {
  it("resolves the time phrase and marks extracted values as ai", () => {
    const f = draftToFacts(draft(), { anchor: ANCHOR });
    expect(f.date).toEqual({ value: "2026-10-08", source: "ai" });
    expect(f.startTime.value).toBe("16:00");
    expect(f.headcount).toEqual({ value: 8, source: "ai" });
  });

  it("small, plain events get every safety field defaulted to false (for attestation)", () => {
    const f = draftToFacts(draft(), { text: "Study session for 8", anchor: ANCHOR });
    for (const k of ["food", "amplifiedSound", "externalGuests", "guestSpeakers", "alcohol", "minors"] as const) {
      expect(f[k]).toEqual({ value: false, source: "default" });
    }
  });

  it("never defaults food or outside guests for events over 25 people", () => {
    const f = draftToFacts(draft({ headcount: 26 }), { anchor: ANCHOR });
    expect(f.food).toEqual({ value: null, source: "ai" });
    expect(f.externalGuests).toEqual({ value: null, source: "ai" });
    expect(f.alcohol.source).toBe("default");
  });

  it('"members" lets outside guests default at any size, unless a guest cue is present', () => {
    const members = draftToFacts(draft({ headcount: 45 }), { text: "coding night for 45 members", anchor: ANCHOR });
    expect(members.externalGuests).toEqual({ value: false, source: "default" });
    expect(members.food).toEqual({ value: null, source: "ai" }); // the size rule still holds for food
    const withGuests = draftToFacts(draft({ headcount: 45 }), { text: "45 members and their guests", anchor: ANCHOR });
    expect(withGuests.externalGuests.value).toBeNull();
  });

  it('a "community room" is a place, not a guest cue', () => {
    expect(draftToFacts(draft(), { text: "practice in the Village community room", anchor: ANCHOR }).externalGuests.source).toBe("default");
    expect(draftToFacts(draft(), { text: "a community meetup", anchor: ANCHOR }).externalGuests.value).toBeNull();
  });

  it("text cues prevent a default", () => {
    const f = draftToFacts(draft(), { text: "study night with pizza and a DJ, open to the public, keynote by an alum", anchor: ANCHOR });
    expect(f.food.value).toBeNull();
    expect(f.amplifiedSound.value).toBeNull();
    expect(f.externalGuests.value).toBeNull();
    expect(f.guestSpeakers.value).toBeNull();
  });

  it('"guest speaker" is not an amplified-sound cue, but "a speaker for music" is', () => {
    expect(draftToFacts(draft(), { text: "workshop with a guest speaker", anchor: ANCHOR }).amplifiedSound.source).toBe("default");
    expect(draftToFacts(draft(), { text: "talk by a speaker from UCSF", anchor: ANCHOR }).amplifiedSound.source).toBe("default");
    expect(draftToFacts(draft(), { text: "we'll bring a speaker", anchor: ANCHOR }).amplifiedSound.value).toBeNull();
  });

  it("explicit extractor answers beat defaults", () => {
    const f = draftToFacts(draft({ food: true, alcohol: false }), { anchor: ANCHOR });
    expect(f.food).toEqual({ value: true, source: "ai" });
    expect(f.alcohol).toEqual({ value: false, source: "ai" });
  });

  it('a date-only phrase fills the date and leaves the times to ask ("40 person event on october 10")', () => {
    const f = draftToFacts(draft({ whenPhrase: "october 10" }), { anchor: ANCHOR });
    expect(f.date).toEqual({ value: "2026-10-10", source: "ai" });
    expect(f.startTime.value).toBeNull();
    expect(f.endTime.value).toBeNull();
  });

  it("an ambiguous time phrase keeps the named day but leaves the times null", () => {
    const f = draftToFacts(draft({ whenPhrase: "Thursday from six to nine" }), { anchor: ANCHOR });
    expect(f.date.value).toBe("2026-10-08");
    expect(f.startTime.value).toBeNull();
    expect(f.endTime.value).toBeNull();
  });
});

describe("corrections", () => {
  it("setFact marks the value as user-sourced without mutating", () => {
    const before = draftToFacts(draft(), { anchor: ANCHOR });
    const after = setFact(before, "headcount", 12);
    expect(after.headcount).toEqual({ value: 12, source: "user" });
    expect(before.headcount).toEqual({ value: 8, source: "ai" });
  });

  it("diffCorrections records only user changes that differ from the original", () => {
    const original = draftToFacts(draft(), { anchor: ANCHOR });
    let current = setFact(original, "headcount", 12);
    current = setFact(current, "alcohol", false); // confirmed the default, same value → not a correction
    current = setFact(current, "requestedRoomId", "CCSC-204");
    expect(diffCorrections(original, current)).toEqual([
      { field: "headcount", aiValue: 8, userValue: 12 },
      { field: "requestedRoomId", aiValue: null, userValue: "CCSC-204" },
    ]);
  });

  it("emptyFacts is entirely user-sourced and unresolved", () => {
    const f = emptyFacts();
    expect(Object.values(f).every((x) => x.source === "user")).toBe(true);
    expect(f.food.value).toBeNull();
  });
});
