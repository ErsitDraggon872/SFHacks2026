import { describe, expect, it } from "vitest";
import { extractEvent, writeExplanation } from "../lib/llm";
import { ROOM_BY_ID, ROOMS } from "../lib/data";
import { draftToFacts } from "../lib/normalize";
import { evaluate } from "../lib/policy";
import type { Booking, EventDraft, EventFacts } from "../lib/types";

describe("lib/llm.ts — Computer 3 Deliverable", () => {
  describe("extractEvent (Fallback & Offline Mode)", () => {
    it("extracts study preset correctly with key unset", async () => {
      const { draft, aiMode } = await extractEvent(
        "Study group for 8 people on Wednesday 4-6pm, we just need a whiteboard. Library if possible.",
      );
      expect(aiMode).toBe("fallback");
      expect(draft.headcount).toBe(8);
      expect(draft.whenPhrase).toBe("Wednesday 4-6pm");
      expect(draft.avNeeds).toContain("whiteboard");
      expect(draft.preferredBuilding).toBe("J. Paul Leonard Library");
    });

    it("extracts pizza hero preset correctly with key unset", async () => {
      const { draft, aiMode } = await extractEvent(
        "ACM coding night for 45 members Thursday 6-9pm in Thornton. We'll have pizza and need a projector.",
      );
      expect(aiMode).toBe("fallback");
      expect(draft.headcount).toBe(45);
      expect(draft.food).toBe(true);
      expect(draft.avNeeds).toContain("projector");
      expect(draft.preferredBuilding).toBe("Thornton Hall");
    });

    it("extracts speaker preset correctly with key unset", async () => {
      const { draft, aiMode } = await extractEvent(
        "Pre-Med Society panel with 150 attendees and two guest speakers from UCSF, Tuesday 5-7pm. We need mics and a projector.",
      );
      expect(aiMode).toBe("fallback");
      expect(draft.headcount).toBe(150);
      expect(draft.guestSpeakers).toBe(true);
      expect(draft.externalGuests).toBe(true);
      expect(draft.amplifiedSound).toBe(true);
      expect(draft.avNeeds).toContain("microphone");
      expect(draft.avNeeds).toContain("projector");
    });

    it("extracts dance preset correctly with key unset", async () => {
      const { draft, aiMode } = await extractEvent(
        "Dance practice for 25 of our members Thursday 9:30-11pm at the Village community room, we'll bring a speaker for music.",
      );
      expect(aiMode).toBe("fallback");
      expect(draft.headcount).toBe(25);
      expect(draft.amplifiedSound).toBe(true);
      expect(draft.preferredBuilding).toBe("Village at Centennial Square");
    });

    it("satisfies requirement 7: 'networking dinner for 80' returns clarifying questions with key unset", async () => {
      const { draft, aiMode } = await extractEvent("networking dinner for 80");
      expect(aiMode).toBe("fallback");
      expect(draft.headcount).toBe(80);
      expect(draft.food).toBe(true);
      // Date and time are not mentioned -> must be in missingRequiredFields
      expect(draft.missingRequiredFields).toEqual(expect.arrayContaining(["date", "startTime", "endTime"]));
      // Clarifying questions must ask about date/time, external guests, and alcohol
      expect(draft.ambiguities.length).toBeGreaterThanOrEqual(2);
      const fieldsAsked = draft.ambiguities.map((a) => a.field);
      expect(fieldsAsked).toContain("externalGuests");
      expect(fieldsAsked).toContain("alcohol");
    });

    it("reads headcount from people phrasing, not the first number in a time range", async () => {
      const { draft } = await extractEvent("Board game night Thursday 6-9pm for 30 people");
      expect(draft.headcount).toBe(30);
      expect(draft.whenPhrase).toBe("Thursday 6-9pm");
    });

    it("does not treat 'for 2 hours' or 'for 6pm' as a headcount", async () => {
      expect((await extractEvent("Officer meeting for 2 hours on Friday")).draft.headcount).toBeNull();
      expect((await extractEvent("Book a room for 6pm Friday")).draft.headcount).toBeNull();
    });

    it("does not pull a preset's facts in on a keyword match", async () => {
      const { draft } = await extractEvent("Dance practice for 5 people Monday 2-3pm");
      expect(draft.headcount).toBe(5);
      expect(draft.whenPhrase).toBe("Monday 2-3pm");
      expect(draft.amplifiedSound).toBeNull();
      expect(draft.preferredBuilding).toBeNull();

      const pizza = await extractEvent("Pizza social, 12 students");
      expect(pizza.draft.headcount).toBe(12);
      expect(pizza.draft.preferredBuilding).toBeNull();
      expect(pizza.draft.avNeeds).toEqual([]);
    });

    it("reads explicit negations as false", async () => {
      const { draft } = await extractEvent("Members only mixer, no alcohol, 20 people Friday 5-7pm");
      expect(draft.alcohol).toBe(false);
      expect(draft.externalGuests).toBe(false);
    });
  });

  describe("writeExplanation", () => {
    it("generates Tier 2 explanation and permit narrative for pizza coding night", async () => {
      const draft: EventDraft = {
        summary: "ACM coding night",
        headcount: 45,
        whenPhrase: "Thursday 6-9pm",
        food: true,
        foodDescription: "Pizza",
        amplifiedSound: null,
        externalGuests: false,
        guestSpeakers: null,
        alcohol: null,
        minors: null,
        weapons: null,
        avNeeds: ["projector"],
        layout: null,
        roomTypeHints: [],
        preferredBuilding: "Thornton Hall",
        missingRequiredFields: [],
        ambiguities: [],
      };
      const facts: EventFacts = draftToFacts(draft, { text: "ACM coding night" });
      const bookings: Booking[] = [];
      const decision = evaluate(facts, { rooms: ROOMS, bookings, clubId: "acm", attested: false });

      expect(decision.tier).toBe(2);
      const writer = await writeExplanation(facts, decision);

      expect(writer.headline).toBeTruthy();
      expect(writer.explanation).toBeTruthy();
      expect(writer.permitNarrative).toBeTruthy();
      expect(writer.briefing).toBeNull();
      expect(writer.citedRuleIds).toContain("FOOD-01");
      expect(writer.citedRuleIds).toContain("FOOD-02");
    });

    it("generates Tier 3 briefing with risk points and staff questions for 150-person guest speaker", async () => {
      const draft: EventDraft = {
        summary: "Speaker panel",
        headcount: 150,
        whenPhrase: "Tuesday 5-7pm",
        food: null,
        foodDescription: null,
        amplifiedSound: true,
        externalGuests: true,
        guestSpeakers: true,
        alcohol: null,
        minors: null,
        weapons: null,
        avNeeds: ["microphone", "projector"],
        layout: "lecture",
        roomTypeHints: [],
        preferredBuilding: null,
        missingRequiredFields: [],
        ambiguities: [],
      };
      const facts: EventFacts = draftToFacts(draft, { text: "Speaker panel" });
      const bookings: Booking[] = [];
      const decision = evaluate(facts, { rooms: ROOMS, bookings, clubId: "premed", attested: false });

      expect(decision.tier).toBe(3);
      const writer = await writeExplanation(facts, decision);

      expect(writer.headline).toBeTruthy();
      expect(writer.explanation).toBeTruthy();
      expect(writer.briefing).not.toBeNull();
      expect(writer.briefing?.summary).toBeTruthy();
      expect(writer.briefing?.riskPoints.length).toBeGreaterThan(0);
      expect(writer.briefing?.staffQuestions.length).toBeGreaterThan(0);
      expect(writer.citedRuleIds).toContain("SIZE-02");
      expect(writer.citedRuleIds).toContain("GUEST-01");
    });

    it("names rooms that would fit but are already booked at that time", async () => {
      const facts = draftToFacts(
        {
          summary: "ACM coding night", headcount: 45, whenPhrase: "Thursday 6-9pm", food: true, foodDescription: "Pizza",
          amplifiedSound: false, externalGuests: false, guestSpeakers: false, alcohol: false, minors: false, weapons: false,
          avNeeds: ["projector"], layout: null, roomTypeHints: [], preferredBuilding: "Thornton Hall",
          missingRequiredFields: [], ambiguities: [],
        },
        { text: "ACM coding night" },
      );
      const taken: Booking = {
        id: "t-1", roomId: "CCSC-204", clubId: "premed", date: facts.date.value!, startTime: "18:00", endTime: "21:00",
        durationMin: 180, status: "confirmed", title: "x", tier: 1, snapshotId: null, createdAt: "2026-10-01T00:00:00.000Z",
      };
      const decision = evaluate(facts, { rooms: ROOMS, bookings: [taken], clubId: "acm", attested: false });
      expect(decision.tier).toBe(2);

      const writer = await writeExplanation(facts, decision);
      expect(writer.explanation).toContain(`${ROOM_BY_ID["CCSC-204"].name} (6 PM–9 PM) is already booked`);
    });
  });
});
