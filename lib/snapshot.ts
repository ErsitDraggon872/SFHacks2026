/**
 * Decision snapshots (structured audit trail). SERVER-ONLY.
 * OWNER: C3 — C1 wrote this minimal working version; extend freely, keep the DecisionSnapshot shape.
 * Never stores model reasoning text: only inputs, extracted facts, corrections, rules, and outputs.
 */
import { newId, readCollection, writeCollection } from "./db";
import { diffCorrections, draftToFacts } from "./normalize";
import type { Booking, BookingRequest, DecisionSnapshot, PolicyDecision, SnapshotStatus } from "./types";
import seedSnapshots from "../data/snapshots.seed.json";

const STATUS: Record<Booking["status"], SnapshotStatus> = {
  confirmed: "auto_approved",
  pending_permit: "permit_pending",
  pending_review: "pending_review",
  denied: "denied",
  cancelled: "denied",
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
  let snaps = readCollection<DecisionSnapshot>("snapshots");
  if (snaps.length === 0 && seedSnapshots && seedSnapshots.length > 0) {
    writeCollection("snapshots", seedSnapshots as DecisionSnapshot[]);
    snaps = seedSnapshots as DecisionSnapshot[];
  }
  return snaps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function setSnapshotStatus(id: string, action: "approve" | "deny"): DecisionSnapshot | null {
  const snaps = readCollection<DecisionSnapshot>("snapshots");
  const snap = snaps.find((s) => s.id === id);
  if (!snap) return null;
  const status: SnapshotStatus = action === "approve" ? "approved" : "denied";
  writeCollection("snapshots", snaps.map((s) => (s.id === id ? { ...s, status } : s)));
  const bookings = readCollection<Booking>("bookings");
  writeCollection(
    "bookings",
    bookings.map((b) => (b.id === snap.bookingId ? { ...b, status: action === "approve" ? "confirmed" : "denied" } : b)),
  );
  return { ...snap, status };
}
