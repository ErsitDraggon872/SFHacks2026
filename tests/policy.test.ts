import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import seedBookings from "@/data/bookings.seed.json";
import demoCache from "@/data/demo-cache.json";
import { POLICY } from "@/lib/data";
import { setFact } from "@/lib/normalize";
import { decide, prepare } from "@/lib/triagePipeline";
import type { Booking, EventDraft, PolicyDecision, PresetId } from "@/lib/types";
import { asDefault, booking, cleanFacts, conflictsFor, eventRuleIds, run } from "./helpers";

describe("baseline", () => {
  it("a clean, fully confirmed small event is Tier 1 and auto-approvable", () => {
    const d = run(cleanFacts());
    expect(d.tier).toBe(1);
    expect(d.canAutoApprove).toBe(true);
    expect(d.canSubmit).toBe(true);
    expect(d.submitOutcome).toBe("confirmed");
    expect(d.eventFlags).toEqual([]);
    expect(d.hardBlocks).toEqual([]);
  });
});

// ---------- one test per rule ----------

describe("rules", () => {
  it("CAP-01 blocks a room whose fire capacity is below the headcount", () => {
    const d = run(cleanFacts({ headcount: 45 }));
    expect(conflictsFor(d, "TH-210")).toContain("CAP-01"); // fire cap 24
    expect(conflictsFor(d, "TH-326")).not.toContain("CAP-01"); // fire cap 52
  });

  it("CAP-01 allows headcount exactly at fire capacity", () => {
    const d = run(cleanFacts({ headcount: 52 }));
    expect(conflictsFor(d, "TH-326")).not.toContain("CAP-01");
    expect(conflictsFor(run(cleanFacts({ headcount: 53 })), "TH-326")).toContain("CAP-01");
  });

  it("FOOD-01 blocks rooms not designated for food", () => {
    const d = run(cleanFacts({ food: true }));
    expect(conflictsFor(d, "TH-326")).toContain("FOOD-01");
    expect(conflictsFor(d, "CCSC-204")).not.toContain("FOOD-01");
  });

  it("FOOD-02 requires a Temporary Food Permit whenever food is served", () => {
    const d = run(cleanFacts({ food: true, foodDescription: "Pizza" }));
    expect(eventRuleIds(d)).toContain("FOOD-02");
    expect(d.permitsRequired.map((p) => p.permitId)).toEqual(["EHS_TEMP_FOOD"]);
    expect(d.permitsRequired[0].fields).toContainEqual({ label: "Food served", value: "Pizza" });
    expect(d.tier).toBe(2);
  });

  it("SOUND-01 blocks amplified sound past 9 PM outside sound-isolated rooms", () => {
    const d = run(cleanFacts({ amplifiedSound: true, startTime: "20:00", endTime: "22:00" }));
    expect(conflictsFor(d, "TH-326")).toContain("SOUND-01");
    expect(conflictsFor(d, "GYM-129")).not.toContain("SOUND-01"); // sound-isolated
    const early = run(cleanFacts({ amplifiedSound: true, startTime: "19:00", endTime: "21:00" }));
    expect(conflictsFor(early, "TH-326")).not.toContain("SOUND-01"); // ending exactly at 9 is fine
  });

  it("SOUND-02 blocks amplified sound past 8 PM near residences", () => {
    const late = run(cleanFacts({ amplifiedSound: true, startTime: "19:00", endTime: "20:30" }));
    expect(conflictsFor(late, "VCS-CR")).toContain("SOUND-02");
    const ok = run(cleanFacts({ amplifiedSound: true, startTime: "18:00", endTime: "20:00" }));
    expect(conflictsFor(ok, "VCS-CR")).not.toContain("SOUND-02");
  });

  it("GUEST-01 escalates events open to non-SFSU guests", () => {
    const d = run(cleanFacts({ externalGuests: true }));
    expect(eventRuleIds(d)).toContain("GUEST-01");
    expect(d.tier).toBe(3);
    expect(d.submitOutcome).toBe("pending_review");
  });

  it("GUEST-02 requires speaker registration", () => {
    const d = run(cleanFacts({ guestSpeakers: true }));
    expect(eventRuleIds(d)).toContain("GUEST-02");
    expect(d.permitsRequired.map((p) => p.permitId)).toEqual(["GUEST_SPEAKER"]);
    expect(d.tier).toBe(2);
  });

  it("SIZE-01 warns above 50 attendees without changing the tier", () => {
    const d = run(cleanFacts({ headcount: 51 }));
    expect(eventRuleIds(d)).toContain("SIZE-01");
    expect(d.tier).toBe(1);
    expect(eventRuleIds(run(cleanFacts({ headcount: 50 })))).not.toContain("SIZE-01");
  });

  it("SIZE-02 escalates above 100 attendees (and replaces SIZE-01)", () => {
    const d = run(cleanFacts({ headcount: 101 }));
    expect(eventRuleIds(d)).toContain("SIZE-02");
    expect(eventRuleIds(d)).not.toContain("SIZE-01");
    expect(d.tier).toBe(3);
    expect(run(cleanFacts({ headcount: 100 })).tier).toBe(1);
  });

  it("ALC-01 escalates any event with alcohol", () => {
    const d = run(cleanFacts({ alcohol: true }));
    expect(eventRuleIds(d)).toContain("ALC-01");
    expect(d.tier).toBe(3);
  });

  it("MINOR-01 escalates events with participants under 18", () => {
    const d = run(cleanFacts({ minors: true }));
    expect(eventRuleIds(d)).toContain("MINOR-01");
    expect(d.tier).toBe(3);
  });

  it("WEAPON-01 escalates any event involving weapons, props or replicas", () => {
    const d = run(cleanFacts({ weapons: true }));
    expect(eventRuleIds(d)).toContain("WEAPON-01");
    expect(d.tier).toBe(3);
  });

  it("HOURS-01 blocks events outside building hours", () => {
    const d = run(cleanFacts({ startTime: "07:30", endTime: "09:00" }));
    expect(conflictsFor(d, "LIB-286")).toContain("HOURS-01"); // library opens 08:00
    expect(conflictsFor(d, "TH-326")).not.toContain("HOURS-01"); // Thornton opens 07:00
    const late = run(cleanFacts({ startTime: "21:00", endTime: "22:30" }));
    expect(conflictsFor(late, "TH-326")).toContain("HOURS-01"); // closes 22:00
    expect(conflictsFor(late, "CCSC-204")).not.toContain("HOURS-01"); // closes 23:00
  });

  it("BOOK-01 rejects an overlapping booking", () => {
    const existing = booking({ roomId: "CCSC-204", startTime: "14:00", endTime: "17:00" });
    const d = run(cleanFacts(), { bookings: [existing] }); // 16:00–18:00
    expect(conflictsFor(d, "CCSC-204")).toContain("BOOK-01");
  });

  it("BOOK-01 allows back-to-back bookings and ignores other days / cancelled ones", () => {
    const d = run(cleanFacts(), {
      bookings: [
        booking({ roomId: "CCSC-204", startTime: "14:00", endTime: "16:00" }), // ends as we start
        booking({ roomId: "CCSC-212", startTime: "18:00", endTime: "19:00" }), // starts as we end
        booking({ roomId: "TH-326", startTime: "16:00", endTime: "18:00", date: "2026-10-09" }),
        booking({ roomId: "TH-210", startTime: "16:00", endTime: "18:00", status: "cancelled" }),
        booking({ roomId: "TH-411", startTime: "16:00", endTime: "18:00", status: "denied" }),
      ],
    });
    for (const id of ["CCSC-204", "CCSC-212", "TH-326", "TH-210", "TH-411"]) expect(conflictsFor(d, id)).not.toContain("BOOK-01");
  });

  it("BOOK-01 counts pending bookings as holds", () => {
    for (const status of ["pending_permit", "pending_review"] as const) {
      const d = run(cleanFacts(), { bookings: [booking({ roomId: "TH-326", startTime: "17:00", endTime: "19:00", status })] });
      expect(conflictsFor(d, "TH-326")).toContain("BOOK-01");
    }
  });

  it("ADA-01 blocks rooms without accessible seating when required", () => {
    const d = run(cleanFacts({ adaRequired: true }));
    expect(conflictsFor(d, "BH-101")).toContain("ADA-01");
    expect(conflictsFor(d, "TH-326")).not.toContain("ADA-01");
    expect(conflictsFor(run(cleanFacts()), "BH-101")).not.toContain("ADA-01");
  });

  it("CAP-DAILY-01 hard-blocks the request when the club would exceed 3 hours that day", () => {
    const used = booking({ roomId: "LIB-460", startTime: "10:00", endTime: "12:00", clubId: "acm" }); // 120 min
    const d = run(cleanFacts({ startTime: "16:00", endTime: "17:01" }), { bookings: [used] }); // +61
    expect(d.hardBlocks.map((h) => h.ruleId)).toEqual(["CAP-DAILY-01"]);
    expect(d.clubMinutesUsed).toBe(120);
    expect(d.canSubmit).toBe(false);
    expect(d.tier).toBe(2);
    const exact = run(cleanFacts({ startTime: "16:00", endTime: "17:00" }), { bookings: [used] }); // +60 = 180
    expect(exact.hardBlocks).toEqual([]);
  });

  it("CAP-DAILY-01 only counts the same club, same day, active bookings", () => {
    const d = run(cleanFacts({ startTime: "16:00", endTime: "18:00" }), {
      clubId: "acm",
      bookings: [
        booking({ roomId: "LIB-460", startTime: "09:00", endTime: "12:00", clubId: "premed" }),
        booking({ roomId: "LIB-460", startTime: "09:00", endTime: "12:00", clubId: "acm", date: "2026-10-09" }),
        booking({ roomId: "LIB-286", startTime: "09:00", endTime: "12:00", clubId: "acm", status: "cancelled" }),
      ],
    });
    expect(d.clubMinutesUsed).toBe(0);
    expect(d.hardBlocks).toEqual([]);
  });

  it("CAP-DAILY-01 rejects the 181st minute", () => {
    expect(run(cleanFacts({ startTime: "10:00", endTime: "13:00" })).hardBlocks).toEqual([]); // 180
    const over = run(cleanFacts({ startTime: "10:00", endTime: "13:01" })); // 181
    expect(over.hardBlocks.map((h) => h.ruleId)).toEqual(["CAP-DAILY-01"]);
    expect(over.canSubmit).toBe(false);
  });

  it("INFO-01 flags unanswered safety questions", () => {
    const d = run(cleanFacts({ guestSpeakers: null }));
    expect(eventRuleIds(d)).toContain("INFO-01");
    expect(d.unresolved).toEqual([{ field: "guestSpeakers", question: expect.any(String) }]);
    expect(d.needsInfo).toBe(true);
  });

  it("every rule in policy.json is exercised by this suite", () => {
    const tested = ["CAP-01", "FOOD-01", "FOOD-02", "SOUND-01", "SOUND-02", "GUEST-01", "GUEST-02", "SIZE-01", "SIZE-02", "ALC-01", "MINOR-01", "WEAPON-01", "HOURS-01", "BOOK-01", "ADA-01", "CAP-DAILY-01", "INFO-01"];
    expect(POLICY.map((r) => r.id).sort()).toEqual([...tested].sort());
  });
});

// ---------- invariants ----------

describe("tri-state: unknown is never no", () => {
  it.each(["food", "amplifiedSound", "externalGuests", "guestSpeakers", "alcohol", "minors", "weapons"] as const)(
    "a null %s blocks Tier 1 and submission",
    (field) => {
      const d = run(cleanFacts({ [field]: null }), { attested: true });
      expect(d.tier).toBe(2);
      expect(d.canAutoApprove).toBe(false);
      expect(d.canSubmit).toBe(false);
      expect(d.submitOutcome).toBeNull();
      expect(d.unresolved.map((u) => u.field)).toContain(field);
    },
  );

  it.each(["headcount", "date", "startTime", "endTime"] as const)("a missing required %s blocks submission", (field) => {
    const d = run(cleanFacts({ [field]: null }));
    expect(d.canSubmit).toBe(false);
    expect(d.unresolved.map((u) => u.field)).toContain(field);
  });

  it("end before start is unresolved, not a negative-length booking", () => {
    const d = run(cleanFacts({ startTime: "18:00", endTime: "16:00" }));
    expect(d.canSubmit).toBe(false);
    expect(d.unresolved.some((u) => u.field === "endTime")).toBe(true);
  });
});

describe("defaults need attestation", () => {
  it("a defaulted safety field blocks submission until the officer attests", () => {
    const facts = asDefault(cleanFacts(), "minors");
    const unattested = run(facts);
    expect(unattested.defaultsToAttest).toEqual(["minors"]);
    expect(unattested.tier).toBe(1);
    expect(unattested.canSubmit).toBe(false);
    expect(unattested.canAutoApprove).toBe(false);

    const attested = run(facts, { attested: true });
    expect(attested.canSubmit).toBe(true);
    expect(attested.canAutoApprove).toBe(true);
  });

  it("assumed-no alcohol and weapons are a given: never attested, still auto-approvable", () => {
    const d = run(asDefault(asDefault(cleanFacts(), "alcohol"), "weapons"));
    expect(d.defaultsToAttest).toEqual([]);
    expect(d.canAutoApprove).toBe(true);
  });

  it("a user-confirmed value needs no attestation", () => {
    expect(run(cleanFacts()).defaultsToAttest).toEqual([]);
  });
});

describe("event-scope vs room-scope flags", () => {
  it("food produces a room conflict (FOOD-01) and an event permit (FOOD-02), kept separate", () => {
    const d = run(cleanFacts({ food: true, guestSpeakers: true, headcount: 60 }));
    for (const f of d.eventFlags) {
      expect(f.scope).toBe("event");
      expect(f.roomId).toBeUndefined();
    }
    for (const r of d.rooms) {
      for (const c of r.conflicts) {
        expect(c.scope).toBe("room");
        expect(c.roomId).toBe(r.roomId);
      }
    }
    expect(eventRuleIds(d)).not.toContain("FOOD-01");
    expect(d.rooms.flatMap((r) => r.conflicts.map((c) => c.ruleId))).not.toContain("FOOD-02");
  });

  it("an event-scope permit doesn't make any room ineligible", () => {
    const d = run(cleanFacts({ guestSpeakers: true }));
    expect(d.rooms.every((r) => r.eligible)).toBe(true);
  });

  it("the daily cap is a hard block, not a room conflict", () => {
    const d = run(cleanFacts({ startTime: "10:00", endTime: "14:00" }));
    expect(d.hardBlocks.map((h) => h.ruleId)).toEqual(["CAP-DAILY-01"]);
    expect(d.rooms.flatMap((r) => r.conflicts.map((c) => c.ruleId))).not.toContain("CAP-DAILY-01");
  });
});

describe("tier matrix", () => {
  const cases: [string, Parameters<typeof cleanFacts>[0], 1 | 2 | 3, PolicyDecision["submitOutcome"]][] = [
    ["clean", {}, 1, "confirmed"],
    ["SIZE-01 warning only", { headcount: 60 }, 1, "confirmed"],
    ["food permit", { food: true }, 2, "pending_permit"],
    ["speaker permit", { guestSpeakers: true }, 2, "pending_permit"],
    ["requested room has a conflict", { food: true, requestedRoomId: "TH-326" }, 2, null],
    ["unanswered question", { minors: null }, 2, null],
    ["daily cap", { startTime: "10:00", endTime: "14:00" }, 2, null],
    ["external guests", { externalGuests: true }, 3, "pending_review"],
    ["alcohol", { alcohol: true }, 3, "pending_review"],
    ["minors", { minors: true }, 3, "pending_review"],
    ["large event", { headcount: 150 }, 3, "pending_review"],
    ["escalation beats permit", { headcount: 150, food: true }, 3, "pending_review"],
    ["no room fits", { headcount: 400 }, 3, null],
  ];
  it.each(cases)("%s → Tier %i", (_name, overrides, tier, outcome) => {
    const d = run(cleanFacts(overrides));
    expect(d.tier).toBe(tier);
    expect(d.submitOutcome).toBe(outcome);
    expect(d.canAutoApprove).toBe(tier === 1 && outcome !== null);
  });
});

describe("Fix It", () => {
  it("suggests an eligible room when the requested one conflicts, and the suggestion is clean", () => {
    const d = run(cleanFacts({ headcount: 45, food: true, requestedRoomId: "TH-326" }));
    expect(d.targetRoomId).toBe("TH-326");
    expect(d.suggestedRoomId).not.toBeNull();
    const fixed = run(setFact(cleanFacts({ headcount: 45, food: true }), "requestedRoomId", d.suggestedRoomId));
    expect(fixed.targetRoomId).toBe(d.suggestedRoomId);
    expect(fixed.suggestedRoomId).toBeNull();
    expect(fixed.canSubmit).toBe(true);
  });
});

describe("decision output", () => {
  it("is pure and deterministic: same inputs, same decision, inputs untouched", () => {
    const facts = cleanFacts({ headcount: 45, food: true });
    const bookings = [booking({ roomId: "CCSC-204", startTime: "14:00", endTime: "17:00" })];
    const snapshot = JSON.stringify({ facts, bookings });
    const a = run(facts, { bookings });
    const b = run(facts, { bookings });
    expect(a).toEqual(b);
    expect(JSON.stringify({ facts, bookings })).toBe(snapshot);
  });

  it("checklist rows describe the target room", () => {
    const d = run(cleanFacts({ headcount: 45, food: true, requestedRoomId: "TH-326" }));
    const row = (id: string) => d.applicableRules.find((r) => r.ruleId === id);
    expect(row("CAP-01")).toMatchObject({ status: "pass", detail: "45 attendees ≤ 52 fire capacity" });
    expect(row("FOOD-01")?.status).toBe("block");
    expect(row("FOOD-02")?.status).toBe("permit");
    expect(row("BOOK-01")?.status).toBe("pass");
    expect(row("CAP-DAILY-01")).toMatchObject({ status: "pass", detail: "2 hrs of 3 hrs daily limit" });
  });

  it("headline names the one change needed when Fix It applies", () => {
    const d = run(cleanFacts({ headcount: 45, food: true, requestedRoomId: "TH-326" }));
    expect(d.headline).toBe("Needs one change: food isn't allowed in Thornton Hall 326");
  });

  it("headline leads with the hard block when the daily cap is hit", () => {
    const d = run(cleanFacts({ startTime: "10:00", endTime: "14:00" }));
    expect(d.headline).toBe(d.hardBlocks[0].message);
  });
});

// ---------- presets reproduce fixtures ----------

describe("presets", () => {
  type CacheEntry = { input: string; clubId: string; expectedTier: 1 | 2 | 3; draft: EventDraft };
  const cache = demoCache as unknown as Record<PresetId, CacheEntry>;
  const seed = seedBookings as Booking[];
  const fixture = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", `triage-${name}.json`), "utf8")).decision as PolicyDecision;

  const decidePreset = (id: PresetId) => {
    const e = cache[id];
    return { entry: e, facts: prepare(e.draft, e.input).facts };
  };

  it.each(["study", "pizza", "speaker", "dance"] as PresetId[])("%s lands on its expected tier and matches its fixture", (id) => {
    const { entry, facts } = decidePreset(id);
    const d = decide(facts, seed, entry.clubId);
    const fx = fixture(id);
    expect(d.tier).toBe(entry.expectedTier);
    expect(d.tier).toBe(fx.tier);
    expect(d.targetRoomId).toBe(fx.targetRoomId);
    expect(d.suggestedRoomId).toBe(fx.suggestedRoomId);
    expect(d.headline).toBe(fx.headline);
  });

  it("pizza-fixed: moving to the suggested room leaves only the food permit", () => {
    const { entry, facts } = decidePreset("pizza");
    const pizza = decide(facts, seed, entry.clubId);
    const d = decide(setFact(facts, "requestedRoomId", pizza.suggestedRoomId), seed, entry.clubId, true);
    const fx = fixture("pizza-fixed");
    expect(d.tier).toBe(fx.tier);
    expect(d.targetRoomId).toBe(fx.targetRoomId);
    expect(d.permitsRequired.map((p) => p.ruleId)).toEqual(["FOOD-02"]);
    expect(d.canSubmit).toBe(true);
    expect(d.submitOutcome).toBe("pending_permit");
  });

  it("known demo outcomes", () => {
    const out = Object.fromEntries(
      (["study", "pizza", "speaker", "dance"] as PresetId[]).map((id) => {
        const { entry, facts } = decidePreset(id);
        const d = decide(facts, seed, entry.clubId);
        return [id, [d.tier, d.targetRoomId, d.suggestedRoomId]];
      }),
    );
    expect(out).toEqual({
      study: [1, "LIB-286", null],
      pizza: [2, "TH-326", "CCSC-204"],
      speaker: [3, "BUS-120", null],
      dance: [2, "VCS-CR", "GYM-129"],
    });
  });
});
