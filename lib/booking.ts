/**
 * The ONE authoritative booking path. SERVER-ONLY. OWNER: C1.
 * Treats any earlier triage result as advisory: re-runs the full policy engine against the
 * current bookings (overlap, fire capacity, room rules, 3-hr daily cap) before writing.
 */
import { ROOMS } from "./data";
import { newId, readCollection, writeCollection } from "./db";
import { durationMin } from "./normalize";
import { evaluate } from "./policy";
import { setFact } from "./normalize";
import type { Booking, BookingRequest, CreateBookingResult } from "./types";

/** Trim + cap free text from the client; blank or non-string → null. */
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

export function createBooking(req: BookingRequest): CreateBookingResult {
  const room = ROOMS.find((r) => r.id === req.roomId);
  if (!room) {
    return { ok: false, errors: [{ ruleId: "BOOK-01", effect: "BLOCK_ROOM", scope: "room", message: `Unknown room ${req.roomId}` }], decision: null };
  }
  // pin the decision to the room being booked
  const facts = setFact(req.facts, "requestedRoomId", req.roomId);

  // --- synchronous critical section: read → validate → write ---
  const bookings = readCollection<Booking>("bookings");
  const decision = evaluate(facts, { rooms: ROOMS, bookings, clubId: req.clubId, attested: req.attested });
  const target = decision.rooms.find((r) => r.roomId === req.roomId)!;

  if (!decision.canSubmit || !decision.submitOutcome) {
    const errors = [...decision.hardBlocks, ...target.conflicts];
    for (const u of decision.unresolved) errors.push({ ruleId: "INFO-01", effect: "WARN", scope: "event", message: u.question });
    if (!errors.length && decision.defaultsToAttest.length && !req.attested) {
      errors.push({ ruleId: "INFO-01", effect: "WARN", scope: "event", message: "Please confirm the assumed details before booking" });
    }
    return { ok: false, errors, decision };
  }

  const booking: Booking = {
    id: newId("bk"),
    roomId: req.roomId,
    clubId: req.clubId,
    date: facts.date.value!,
    startTime: facts.startTime.value!,
    endTime: facts.endTime.value!,
    durationMin: durationMin(facts.startTime.value, facts.endTime.value)!,
    status: decision.submitOutcome,
    title: cleanText(req.eventName, 120) ?? facts.summary.value ?? "Student organization event",
    description: cleanText(req.eventDescription, 1000),
    tier: decision.tier,
    snapshotId: null,
    createdAt: new Date().toISOString(),
  };
  writeCollection("bookings", [...bookings, booking]);
  return { ok: true, booking, decision };
}
