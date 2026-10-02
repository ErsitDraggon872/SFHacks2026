import { describe, expect, it } from "vitest";
import { GET as adminGet, POST as adminPost } from "../app/api/admin/route";
import { POST as bookingsPost } from "../app/api/bookings/route";
import { listSnapshots } from "../lib/snapshot";
import { readCollection, writeCollection } from "../lib/db";
import type { AdminResponse, Booking, BookingRequest, DecisionSnapshot } from "../lib/types";

describe("Snapshots & Admin API — Computer 3 Deliverable", () => {
  it("lists snapshots and contains seed data", () => {
    const snaps = listSnapshots();
    expect(snaps.length).toBeGreaterThan(0);
    const snap = snaps[0];
    expect(snap.id).toBeTruthy();
    expect(snap.clubId).toBeTruthy();
    expect(snap.status).toBeTruthy();
  });

  it("GET /api/admin returns pending items, log, and counts", async () => {
    const res = await adminGet();
    expect(res.status).toBe(200);
    const body: AdminResponse = await res.json();
    expect(Array.isArray(body.pending)).toBe(true);
    expect(Array.isArray(body.log)).toBe(true);
    expect(typeof body.counts.autoApproved).toBe("number");
    expect(typeof body.counts.permitAssisted).toBe("number");
    expect(typeof body.counts.escalated).toBe("number");
  });

  it("POST /api/admin can approve a pending Tier 3 snapshot", async () => {
    const snaps = listSnapshots();
    const pendingSnap = snaps.find((s) => s.status === "pending_review");
    if (!pendingSnap) return;

    const req = new Request("http://localhost:3000/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: pendingSnap.id, action: "approve" }),
    });
    const res = await adminPost(req);
    expect(res.status).toBe(200);
    const updated: DecisionSnapshot = await res.json();
    expect(updated.id).toBe(pendingSnap.id);
    expect(updated.status).toBe("approved");

    // Revert back to pending_review for clean demo state
    const allSnaps = listSnapshots();
    const target = allSnaps.find((s) => s.id === pendingSnap.id);
    if (target) target.status = "pending_review";
  });

  it("POST /api/bookings saves a DecisionSnapshot and returns booking with snapshotId", async () => {
    // Generate a unique date to avoid BOOK-01 collisions on repeated test runs
    const testDate = "2026-10-15";
    const bookingReq: BookingRequest = {
      clubId: "sfhacks",
      roomId: "LIB-460",
      facts: {
        summary: { value: "Idempotent test meeting", source: "user" },
        headcount: { value: 6, source: "user" },
        date: { value: testDate, source: "user" },
        startTime: { value: "14:00", source: "user" },
        endTime: { value: "15:00", source: "user" },
        food: { value: false, source: "user" },
        foodDescription: { value: null, source: "user" },
        amplifiedSound: { value: false, source: "user" },
        externalGuests: { value: false, source: "user" },
        guestSpeakers: { value: false, source: "user" },
        alcohol: { value: false, source: "user" },
        minors: { value: false, source: "user" },
        avNeeds: { value: [], source: "user" },
        layout: { value: null, source: "user" },
        preferredBuilding: { value: null, source: "user" },
        requestedRoomId: { value: "LIB-460", source: "user" },
        adaRequired: { value: false, source: "user" },
      },
      attested: true,
      requestText: "Idempotent test meeting for 6",
      draft: null,
      writer: null,
    };

    // Remove any previous test booking on this slot if it exists
    const existingBookings = readCollection<Booking>("bookings");
    writeCollection(
      "bookings",
      existingBookings.filter((b) => !(b.roomId === "LIB-460" && b.date === testDate)),
    );

    const req = new Request("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bookingReq),
    });

    const res = await bookingsPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.booking.snapshotId).toBeTruthy();

    const snaps = listSnapshots();
    const saved = snaps.find((s) => s.id === body.booking.snapshotId);
    expect(saved).toBeDefined();
    expect(saved?.selectedRoomId).toBe("LIB-460");
    expect(saved?.clubId).toBe("sfhacks");

    // Clean up test booking and snapshot to keep runtime data clean
    writeCollection(
      "bookings",
      readCollection<Booking>("bookings").filter((b) => b.id !== body.booking.id),
    );
    writeCollection(
      "snapshots",
      readCollection<DecisionSnapshot>("snapshots").filter((s) => s.id !== body.booking.snapshotId),
    );
  });
});
