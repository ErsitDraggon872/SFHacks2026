import { describe, expect, it } from "vitest";
import { ROOMS } from "../lib/data";
import { resolveWhen, setFact, emptyFacts } from "../lib/normalize";
import { evaluate } from "../lib/policy";
import { isOversized, rankRooms } from "../lib/rank";
import type { Booking } from "../lib/types";

describe("Deterministic Policy Engine & Normalization Tests", () => {
  it("resolves 'Thursday 6-9pm' to 2026-10-08 18:00-21:00 against demo anchor (2026-10-05)", () => {
    const res = resolveWhen("Thursday 6-9pm", "2026-10-05");
    expect("durationMin" in res).toBe(true);
    if ("durationMin" in res) {
      expect(res.date).toBe("2026-10-08");
      expect(res.startTime).toBe("18:00");
      expect(res.endTime).toBe("21:00");
      expect(res.durationMin).toBe(180);
    }
  });

  it("tri-state null blocks Tier 1 auto-approval (unknown is not treated as no)", () => {
    let facts = emptyFacts();
    facts = setFact(facts, "headcount", 15);
    facts = setFact(facts, "date", "2026-10-07");
    facts = setFact(facts, "startTime", "14:00");
    facts = setFact(facts, "endTime", "16:00");
    facts = setFact(facts, "requestedRoomId", "LIB-460");
    // Leave alcohol as null
    facts = setFact(facts, "alcohol", null);

    const bookings: Booking[] = [];
    const decision = evaluate(facts, { rooms: ROOMS, bookings, clubId: "study", attested: true });

    // Since alcohol is null (unresolved safety field), cannot auto approve
    expect(decision.canAutoApprove).toBe(false);
    expect(decision.tier).toBeGreaterThanOrEqual(2);
  });

  it("event risk is kept separate from room compatibility", () => {
    let facts = emptyFacts();
    facts = setFact(facts, "headcount", 45);
    facts = setFact(facts, "date", "2026-10-08");
    facts = setFact(facts, "startTime", "18:00");
    facts = setFact(facts, "endTime", "21:00");
    facts = setFact(facts, "food", true);
    facts = setFact(facts, "foodDescription", "Pizza");
    facts = setFact(facts, "amplifiedSound", false);
    facts = setFact(facts, "externalGuests", false);
    facts = setFact(facts, "guestSpeakers", false);
    facts = setFact(facts, "alcohol", false);
    facts = setFact(facts, "minors", false);
    facts = setFact(facts, "weapons", false);
    facts = setFact(facts, "requestedRoomId", "TH-326"); // Thornton room blocks food

    const bookings: Booking[] = [];
    const decision = evaluate(facts, { rooms: ROOMS, bookings, clubId: "acm", attested: true });

    expect(decision.tier).toBe(2);
    // Room conflict on TH-326
    const th326 = decision.rooms.find((r) => r.roomId === "TH-326");
    expect(th326?.eligible).toBe(false);
    expect(th326?.conflicts.some((c) => c.ruleId === "FOOD-01")).toBe(true);

    // But CCSC-204 allows food and is eligible
    const ccsc204 = decision.rooms.find((r) => r.roomId === "CCSC-204");
    expect(ccsc204?.eligible).toBe(true);
    expect(decision.suggestedRoomId).toBe("CCSC-204");
  });

  it("daily cap rejects booking when club exceeds 180 minutes in one day", () => {
    let facts = emptyFacts();
    facts = setFact(facts, "headcount", 10);
    facts = setFact(facts, "date", "2026-10-08");
    facts = setFact(facts, "startTime", "18:00");
    facts = setFact(facts, "endTime", "20:00"); // 120 min
    facts = setFact(facts, "food", false);
    facts = setFact(facts, "amplifiedSound", false);
    facts = setFact(facts, "externalGuests", false);
    facts = setFact(facts, "guestSpeakers", false);
    facts = setFact(facts, "alcohol", false);
    facts = setFact(facts, "minors", false);
    facts = setFact(facts, "weapons", false);
    facts = setFact(facts, "requestedRoomId", "LIB-460");

    // Existing booking of 120 min on the same date for the same club
    const existingBookings: Booking[] = [
      {
        id: "seed-prior",
        roomId: "TH-210",
        clubId: "acm",
        date: "2026-10-08",
        startTime: "12:00",
        endTime: "14:00", // 120 min
        durationMin: 120,
        status: "confirmed",
        title: "Prior meeting",
        tier: 1,
        snapshotId: null,
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ];

    // Total would be 120 + 120 = 240 min > 180 min cap
    const decision = evaluate(facts, { rooms: ROOMS, bookings: existingBookings, clubId: "acm", attested: true });
    expect(decision.hardBlocks.some((b) => b.ruleId === "CAP-DAILY-01")).toBe(true);
    expect(decision.canSubmit).toBe(false);
  });
});

describe("rankRooms: oversized rooms", () => {
  it("a snug room beats a cavernous one, even when only the big room has the requested AV", () => {
    let facts = emptyFacts();
    facts = setFact(facts, "headcount", 8);
    facts = setFact(facts, "date", "2026-10-07");
    facts = setFact(facts, "startTime", "14:00");
    facts = setFact(facts, "endTime", "16:00");
    facts = setFact(facts, "avNeeds", ["microphone"]); // only 60+ seat rooms have mics
    const decision = evaluate(facts, { rooms: ROOMS, bookings: [], clubId: "study", attested: true });
    const ranked = rankRooms(facts, decision, ROOMS).filter((r) => r.rank !== null);

    expect(isOversized(ranked[0].room, 8)).toBe(false);
    const hall = ranked.find((r) => r.room.id === "BUS-120")!;
    expect(hall.rank!).toBeGreaterThan(ranked[0].rank!);
    expect(hall.reasons).toContainEqual({ label: "Much larger than needed", kind: "miss" });
  });

  it("small groups get slack: 40 seats for 10 is not oversized, 41 is", () => {
    const room = (seats: number) => ({ ...ROOMS[0], seats });
    expect(isOversized(room(40), 10)).toBe(false);
    expect(isOversized(room(41), 10)).toBe(true);
    expect(isOversized(room(500), null)).toBe(false);
  });
});
