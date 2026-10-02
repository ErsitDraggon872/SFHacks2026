import { describe, expect, it } from "vitest";
import { GET as adminGet, POST as adminPost } from "../app/api/admin/route";
import { POST as bookingsPost } from "../app/api/bookings/route";
import { listSnapshots } from "../lib/snapshot";
import { cleanFacts } from "./helpers";
import { readCollection, resetCollection, writeCollection } from "../lib/db";
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
    expect(pendingSnap).toBeDefined();
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
  });

  it("denying a seed snapshot only denies its own backing booking", async () => {
    const before = readCollection<Booking>("bookings");
    for (const snap of listSnapshots().filter((s) => s.id.startsWith("snap-history-"))) {
      const req = new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, action: "deny" }),
      });
      expect((await adminPost(req)).status).toBe(200);
    }
    // each history snapshot denies only its own backing booking
    const after = readCollection<Booking>("bookings");
    for (const b of after) {
      const prev = before.find((p) => p.id === b.id)!;
      expect(b).toEqual(b.id.startsWith("history-") ? { ...prev, status: "denied" } : prev);
    }
    resetCollection("bookings");
    resetCollection("snapshots");
  });

  it("synthesized booking snapshots have unique ids and deny their own booking", async () => {
    const snaps = listSnapshots();
    expect(new Set(snaps.map((s) => s.id)).size).toBe(snaps.length);

    const res = await adminPost(new Request("http://localhost:3000/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "snap-booking-seed-4", action: "deny" }),
    }));
    expect(res.status).toBe(200);
    const bookings = readCollection<Booking>("bookings");
    expect(bookings.find((b) => b.id === "seed-4")?.status).toBe("denied");
    expect(bookings.filter((b) => b.status === "denied").map((b) => b.id)).toEqual(["seed-4"]);
    resetCollection("bookings");
    resetCollection("snapshots");
  });

  it("denying a real booking's snapshot denies that booking", async () => {
    writeCollection("bookings", [
      { id: "b-1", roomId: "LIB-460", clubId: "acm", date: "2026-10-20", startTime: "10:00", endTime: "11:00",
        durationMin: 60, status: "pending_review", title: "x", tier: 3, snapshotId: "s-1", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b-2", roomId: "BH-101", clubId: "premed", date: "2026-10-20", startTime: "10:00", endTime: "11:00",
        durationMin: 60, status: "confirmed", title: "y", tier: 1, snapshotId: null, createdAt: "2026-10-01T00:00:00.000Z" },
    ] as Booking[]);
    const seed = listSnapshots()[0];
    writeCollection("snapshots", [
      { ...seed, id: "s-1", bookingId: "b-1", clubId: "acm", selectedRoomId: "LIB-460", status: "pending_review",
        facts: { ...seed.facts, date: { value: "2026-10-20", source: "user" }, startTime: { value: "10:00", source: "user" } } },
      // Wrong club/room for b-2: must not touch it.
      { ...seed, id: "s-2", bookingId: "b-2", clubId: "acm", selectedRoomId: "LIB-460", status: "pending_review" },
    ] as DecisionSnapshot[]);

    for (const snapshotId of ["s-1", "s-2"]) {
      await adminPost(new Request("http://localhost:3000/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId, action: "deny" }),
      }));
    }
    const after = readCollection<Booking>("bookings");
    expect(after.find((b) => b.id === "b-1")?.status).toBe("denied");
    expect(after.find((b) => b.id === "b-2")?.status).toBe("confirmed");
    resetCollection("bookings");
    resetCollection("snapshots");
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
        weapons: { value: false, source: "user" },
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

  it("re-approving a denied booking is refused with 409 when the slot was taken", async () => {
    writeCollection("bookings", [
      { id: "b-1", roomId: "LIB-286", clubId: "acm", date: "2026-10-20", startTime: "16:00", endTime: "18:00",
        durationMin: 120, status: "denied", title: "x", tier: 2, snapshotId: "s-1", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b-2", roomId: "LIB-286", clubId: "premed", date: "2026-10-20", startTime: "17:00", endTime: "19:00",
        durationMin: 120, status: "confirmed", title: "y", tier: 1, snapshotId: null, createdAt: "2026-10-01T00:00:00.000Z" },
    ] as Booking[]);
    const seed = listSnapshots()[0];
    writeCollection("snapshots", [
      { ...seed, id: "s-1", bookingId: "b-1", clubId: "acm", selectedRoomId: "LIB-286", status: "denied",
        facts: { ...seed.facts, date: { value: "2026-10-20", source: "user" }, startTime: { value: "16:00", source: "user" } } },
    ] as DecisionSnapshot[]);

    const res = await adminPost(new Request("http://localhost:3000/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "s-1", action: "approve" }),
    }));
    expect(res.status).toBe(409);
    expect(readCollection<Booking>("bookings").find((b) => b.id === "b-1")?.status).toBe("denied");
    expect(readCollection<DecisionSnapshot>("snapshots").find((s) => s.id === "s-1")?.status).toBe("denied");
    resetCollection("bookings");
    resetCollection("snapshots");
  });

  it("re-approving a denied booking succeeds when nothing took the slot", async () => {
    writeCollection("bookings", [
      { id: "b-1", roomId: "LIB-286", clubId: "acm", date: "2026-10-20", startTime: "16:00", endTime: "18:00",
        durationMin: 120, status: "denied", title: "x", tier: 2, snapshotId: "s-1", createdAt: "2026-10-01T00:00:00.000Z" },
    ] as Booking[]);
    const seed = listSnapshots()[0];
    writeCollection("snapshots", [
      { ...seed, id: "s-1", bookingId: "b-1", clubId: "acm", selectedRoomId: "LIB-286", status: "denied",
        facts: { ...seed.facts, date: { value: "2026-10-20", source: "user" }, startTime: { value: "16:00", source: "user" } } },
    ] as DecisionSnapshot[]);

    const res = await adminPost(new Request("http://localhost:3000/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "s-1", action: "approve" }),
    }));
    expect(res.status).toBe(200);
    expect(readCollection<Booking>("bookings").find((b) => b.id === "b-1")?.status).toBe("confirmed");
    resetCollection("bookings");
    resetCollection("snapshots");
  });

  it("re-approving a denied booking is refused with 409 when it would bust the daily cap", async () => {
    writeCollection("bookings", [
      { id: "b-1", roomId: "LIB-286", clubId: "acm", date: "2026-10-20", startTime: "16:00", endTime: "18:00",
        durationMin: 120, status: "denied", title: "x", tier: 2, snapshotId: "s-1", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b-3", roomId: "TH-326", clubId: "acm", date: "2026-10-20", startTime: "09:00", endTime: "11:00",
        durationMin: 120, status: "confirmed", title: "y", tier: 1, snapshotId: null, createdAt: "2026-10-01T00:00:00.000Z" },
    ] as Booking[]);
    const seed = listSnapshots()[0];
    writeCollection("snapshots", [
      { ...seed, id: "s-1", bookingId: "b-1", clubId: "acm", selectedRoomId: "LIB-286", status: "denied",
        facts: { ...seed.facts, date: { value: "2026-10-20", source: "user" }, startTime: { value: "16:00", source: "user" } } },
    ] as DecisionSnapshot[]);

    const res = await adminPost(new Request("http://localhost:3000/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: "s-1", action: "approve" }),
    }));
    expect(res.status).toBe(409);
    expect(readCollection<Booking>("bookings").find((b) => b.id === "b-1")?.status).toBe("denied");
    resetCollection("bookings");
    resetCollection("snapshots");
  });

  it("seed history snapshots hold their room: double-booking one is blocked", async () => {
    resetCollection("bookings");
    resetCollection("snapshots");
    const history = listSnapshots().find((s) => s.id === "snap-history-1")!;
    const bookingReq: BookingRequest = {
      clubId: "dance",
      roomId: history.selectedRoomId!,
      facts: cleanFacts({
        summary: "Dance group dancing",
        headcount: 20,
        date: history.facts.date.value,
        startTime: history.facts.startTime.value,
        endTime: history.facts.endTime.value,
        requestedRoomId: history.selectedRoomId,
      }),
      attested: true,
      requestText: "Dance group dancing",
      draft: null,
      writer: null,
    };
    const res = await bookingsPost(new Request("http://localhost:3000/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bookingReq),
    }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors.map((e: { ruleId: string }) => e.ruleId)).toContain("BOOK-01");
    resetCollection("bookings");
    resetCollection("snapshots");
  });
});
