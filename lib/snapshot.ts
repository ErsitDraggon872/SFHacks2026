/**
 * Decision snapshots (structured audit trail). SERVER-ONLY.
 * OWNER: C3 — C1 wrote this minimal working version; extend freely, keep the DecisionSnapshot shape.
 * Never stores model reasoning text: only inputs, extracted facts, corrections, rules, and outputs.
 */
import { newId, readCollection, writeCollection } from "./db";
import { diffCorrections, draftToFacts } from "./normalize";
import type { Booking, BookingRequest, DecisionSnapshot, PolicyDecision, SnapshotStatus } from "./types";

const STATUS: Record<Booking["status"], SnapshotStatus> = {
  confirmed: "auto_approved",
  pending_permit: "permit_pending",
  pending_review: "pending_review",
  denied: "denied",
  cancelled: "cancelled",
};

export function saveSnapshot(req: BookingRequest, booking: Booking, decision: PolicyDecision): DecisionSnapshot {
  const aiFacts = req.draft ? draftToFacts(req.draft, { text: req.requestText ?? undefined }) : null;
  const snapshot: DecisionSnapshot = {
    id: newId("snap"),
    createdAt: new Date().toISOString(),
    clubId: req.clubId,
    requestText: req.requestText,
    draft: req.draft,
    facts: req.facts,
    userCorrections: aiFacts ? diffCorrections(aiFacts, req.facts) : [],
    matchedRules: [...new Set(decision.applicableRules.filter((r) => r.status !== "pass").map((r) => r.ruleId))],
    selectedRoomId: booking.roomId,
    tier: decision.tier,
    writer: req.writer,
    bookingId: booking.id,
    status: STATUS[booking.status],
    eventName: booking.title,
    eventDescription: booking.description ?? null,
  };
  writeCollection("snapshots", [...readCollection<DecisionSnapshot>("snapshots"), snapshot]);
  const bookings = readCollection<Booking>("bookings");
  writeCollection(
    "bookings",
    bookings.map((b) => (b.id === booking.id ? { ...b, snapshotId: snapshot.id } : b)),
  );
  return snapshot;
}

export function listSnapshots(): DecisionSnapshot[] {
  const snaps = readCollection<DecisionSnapshot>("snapshots");
  const bookings = readCollection<Booking>("bookings");
  const snapBookingIds = new Set(snaps.map((s) => s.bookingId));
  const existingSnapIds = new Set(snaps.map((s) => s.id));

  const seedSnaps: DecisionSnapshot[] = bookings
    .filter((b) => !snapBookingIds.has(b.id))
    .map((b) => {
      let id = `snap-booking-${b.id}`;
      let counter = 1;
      while (existingSnapIds.has(id)) {
        id = `snap-booking-${b.id}-${counter++}`;
      }
      existingSnapIds.add(id);

      return {
        id,
        createdAt: b.createdAt,
        clubId: b.clubId,
        requestText: `${b.title} (${b.durationMin} min)`,
        draft: null,
        facts: {
          summary: { value: b.title, source: "user" },
          headcount: { value: null, source: "user" },
          date: { value: b.date, source: "user" },
          startTime: { value: b.startTime, source: "user" },
          endTime: { value: b.endTime, source: "user" },
          food: { value: false, source: "default" },
          foodDescription: { value: null, source: "user" },
          amplifiedSound: { value: false, source: "default" },
          externalGuests: { value: false, source: "default" },
          guestSpeakers: { value: false, source: "default" },
          alcohol: { value: false, source: "default" },
          minors: { value: false, source: "default" },
          avNeeds: { value: [], source: "user" },
          layout: { value: null, source: "user" },
          preferredBuilding: { value: null, source: "user" },
          requestedRoomId: { value: b.roomId, source: "user" },
          adaRequired: { value: false, source: "user" },
        },
        userCorrections: [],
        matchedRules: [],
        selectedRoomId: b.roomId,
        tier: b.tier,
        writer: null,
        bookingId: b.id,
        status: STATUS[b.status],
      };
    });

  const seenIds = new Set<string>();
  const uniqueSnaps: DecisionSnapshot[] = [];
  for (const s of [...snaps, ...seedSnaps]) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      uniqueSnaps.push(s);
    }
  }

  return uniqueSnaps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setSnapshotStatus(id: string, action: "approve" | "deny", message?: string): DecisionSnapshot | null {
  const snaps = readCollection<DecisionSnapshot>("snapshots");
  const bookings = readCollection<Booking>("bookings");
  let snap = snaps.find((s) => s.id === id || s.bookingId === id);

  // If this was a synthesized snapshot from a booking, materialize it into snapshots
  if (!snap) {
    const booking = bookings.find(
      (b) =>
        b.id === id ||
        `snap-booking-${b.id}` === id ||
        `snap-${b.id}` === id ||
        id.startsWith(`snap-booking-${b.id}`),
    );
    if (!booking) return null;
    const all = listSnapshots();
    snap = all.find((s) => s.id === id || s.bookingId === booking.id);
    if (snap) {
      snaps.push(snap);
    } else {
      return null;
    }
  }

  // a club-cancelled booking is final: re-approving would skip the overlap/cap re-check
  if (snap.status === "cancelled") return null;

  const status: SnapshotStatus = action === "approve" ? "approved" : "denied";
  const sentMessage = message ? { text: message, action, sentAt: new Date().toISOString() } : undefined;
  const history = snap.messageHistory ?? [];
  const updatedHistory = sentMessage ? [...history, sentMessage] : history;

  const updatedSnap: DecisionSnapshot = {
    ...snap,
    status,
    adminMessage: message ?? snap.adminMessage,
    messageHistory: updatedHistory,
  };

  const updatedSnaps = snaps.map((s) => (s.id === snap.id ? updatedSnap : s));
  if (!updatedSnaps.some((s) => s.id === updatedSnap.id)) {
    updatedSnaps.push(updatedSnap);
  }
  writeCollection("snapshots", updatedSnaps);

  // Only touch the booking this snapshot describes. Seed snapshots are history-only, and a stale or
  // mismatched id must never confirm or cancel someone else's booking.
  const isSnapshotBooking = (b: Booking) =>
    b.id === snap.bookingId &&
    b.roomId === snap.selectedRoomId &&
    b.clubId === snap.clubId &&
    b.date === snap.facts.date.value &&
    b.startTime === snap.facts.startTime.value;
  if (bookings.some(isSnapshotBooking)) {
    writeCollection(
      "bookings",
      bookings.map((b) => (isSnapshotBooking(b) ? { ...b, status: action === "approve" ? "confirmed" : "denied" } : b)),
    );
  }
  return updatedSnap;
}

/** Mirror a club's cancellation onto its audit snapshot (synthesized seed snapshots pick it up from the booking). */
export function markSnapshotCancelled(bookingId: string) {
  const snaps = readCollection<DecisionSnapshot>("snapshots");
  if (!snaps.some((s) => s.bookingId === bookingId)) return;
  writeCollection(
    "snapshots",
    snaps.map((s) => (s.bookingId === bookingId ? { ...s, status: "cancelled" as const } : s)),
  );
}
