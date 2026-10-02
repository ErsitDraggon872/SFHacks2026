import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOMS } from "../lib/data";
import { draftToFacts } from "../lib/normalize";
import { evaluate } from "../lib/policy";
import type { EventDraft } from "../lib/types";

// Each test sets what the mocked Gemini client returns.
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const { extractEvent, writeExplanation } = await import("../lib/llm");

const speakerDraft: EventDraft = {
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
  avNeeds: ["microphone"],
  layout: "lecture",
  roomTypeHints: [],
  preferredBuilding: null,
  missingRequiredFields: [],
  ambiguities: [],
};

function tier(draft: EventDraft) {
  const facts = draftToFacts(draft, { text: draft.summary ?? "" });
  return { facts, decision: evaluate(facts, { rooms: ROOMS, bookings: [], clubId: "premed", attested: false }) };
}

describe("lib/llm.ts with a live client (mocked)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    generateContent.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("strips unknown rule IDs and fills a missing Tier 3 briefing", async () => {
    const { facts, decision } = tier(speakerDraft);
    expect(decision.tier).toBe(3);
    generateContent.mockResolvedValue({
      text: JSON.stringify({ headline: "Review", explanation: "Needs staff.", citedRuleIds: ["SIZE-02", "FAKE-99"], briefing: null }),
    });

    const writer = await writeExplanation(facts, decision);
    expect(writer.citedRuleIds).toEqual(["SIZE-02"]);
    expect(writer.briefing?.summary).toBeTruthy();
    expect(writer.briefing?.riskPoints.length).toBeGreaterThan(0);
    expect(writer.briefing?.riskPoints.every((r) => r.ruleId !== "FAKE-99")).toBe(true);
  });

  it("falls back to the offline writer when model output lacks a headline", async () => {
    const { facts, decision } = tier(speakerDraft);
    generateContent.mockResolvedValue({ text: JSON.stringify({ explanation: "x", citedRuleIds: [] }) });

    const writer = await writeExplanation(facts, decision);
    expect(writer.headline).toBe("Staff review required — briefing prepared");
    expect(generateContent).toHaveBeenCalledTimes(2); // primary, then secondary model
  });

  it("drops a briefing the model returns for a Tier 2 decision", async () => {
    const { facts, decision } = tier({ ...speakerDraft, headcount: 40, externalGuests: false, guestSpeakers: false, food: true, foodDescription: "Pizza" });
    expect(decision.tier).toBe(2);
    generateContent.mockResolvedValue({
      text: JSON.stringify({ headline: "Almost there", explanation: "Move rooms.", citedRuleIds: [], briefing: { summary: "s", riskPoints: [], staffQuestions: [] } }),
    });

    expect((await writeExplanation(facts, decision)).briefing).toBeNull();
  });

  it("times out a hung model call and falls back", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => {}));

    const pending = extractEvent("networking dinner for 80");
    await vi.advanceTimersByTimeAsync(20_000);
    const { aiMode, draft } = await pending;
    expect(aiMode).toBe("fallback");
    expect(draft.headcount).toBe(80);
  });
});
