/** Shared builders for engine tests. */
import { ROOMS } from "@/lib/data";
import { emptyFacts, setFact } from "@/lib/normalize";
import { evaluate } from "@/lib/policy";
import type { Booking, EventFacts, FactField } from "@/lib/types";

export const DATE = "2026-10-08"; // Thursday after the demo anchor

/** A fully resolved, user-confirmed, harmless event: 8 people, Thursday 4–6 PM, nothing risky. */
export function cleanFacts(overrides: Partial<{ [K in FactField]: EventFacts[K]["value"] }> = {}): EventFacts {
  let f = emptyFacts();
  const base: Partial<{ [K in FactField]: EventFacts[K]["value"] }> = {
    summary: "Test event",
    headcount: 8,
    date: DATE,
    startTime: "16:00",
    endTime: "18:00",
    food: false,
    amplifiedSound: false,
    externalGuests: false,
    guestSpeakers: false,
    alcohol: false,
    minors: false,
    weapons: false,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) f = setFact(f, k as FactField, v as never);
  return f;
}

/** Mark a fact as filled by a contextual default (keeps its value). */
export function asDefault(facts: EventFacts, field: FactField): EventFacts {
  return { ...facts, [field]: { value: facts[field].value, source: "default" } };
}

export function booking(p: Partial<Booking> & Pick<Booking, "roomId" | "startTime" | "endTime">): Booking {
  const [sh, sm] = p.startTime.split(":").map(Number);
  const [eh, em] = p.endTime.split(":").map(Number);
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    clubId: "sfhacks",
    date: DATE,
    durationMin: eh * 60 + em - (sh * 60 + sm),
    status: "confirmed",
    title: "Existing booking",
    tier: 1,
    snapshotId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...p,
  };
}

export function run(facts: EventFacts, opts: { bookings?: Booking[]; clubId?: string; attested?: boolean } = {}) {
  return evaluate(facts, {
    rooms: ROOMS,
    bookings: opts.bookings ?? [],
    clubId: opts.clubId ?? "acm",
    attested: opts.attested ?? false,
  });
}

/** Room-scope conflict rule ids for one room. */
export function conflictsFor(decision: ReturnType<typeof run>, roomId: string): string[] {
  return decision.rooms.find((r) => r.roomId === roomId)!.conflicts.map((c) => c.ruleId);
}

export function eventRuleIds(decision: ReturnType<typeof run>): string[] {
  return decision.eventFlags.map((f) => f.ruleId);
}
