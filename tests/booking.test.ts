import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "@/lib/types";
import { asDefault, booking, cleanFacts } from "./helpers";

// In-memory store instead of data/runtime/*.json.
const store: Record<string, unknown[]> = {};
vi.mock("@/lib/db", () => ({
  readCollection: (name: string) => [...(store[name] ?? [])],
  writeCollection: (name: string, rows: unknown[]) => {
    store[name] = [...rows];
  },
  newId: (prefix: string) => `${prefix}-test-${Object.keys(store).length}`,
}));

const { createBooking } = await import("@/lib/booking");

const bookings = () => (store.bookings ?? []) as Booking[];

beforeEach(() => {
  store.bookings = [];
});

describe("createBooking", () => {
  it("writes a confirmed booking for a clean Tier 1 request", () => {
    const res = createBooking({ clubId: "acm", roomId: "LIB-286", facts: cleanFacts(), attested: false, requestText: null, draft: null, writer: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking).toMatchObject({ roomId: "LIB-286", date: "2026-10-08", startTime: "16:00", endTime: "18:00", durationMin: 120, status: "confirmed", tier: 1 });
    expect(bookings()).toHaveLength(1);
  });

  it("a food event in a food room becomes pending_permit", () => {
    const res = createBooking({ clubId: "acm", roomId: "CCSC-204", facts: cleanFacts({ headcount: 45, food: true }), attested: false, requestText: null, draft: null, writer: null });
    expect(res.ok && res.booking.status).toBe("pending_permit");
  });

  it("revalidates at commit: a room booked after triage is rejected with BOOK-01", () => {
    const facts = cleanFacts({ headcount: 45, food: true });
    // someone else grabs CCSC-204 between triage and submit
    store.bookings = [booking({ roomId: "CCSC-204", startTime: "17:00", endTime: "19:00", clubId: "premed" })];
    const res = createBooking({ clubId: "acm", roomId: "CCSC-204", facts, attested: true, requestText: null, draft: null, writer: null });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.map((e) => e.ruleId)).toContain("BOOK-01");
    expect(bookings()).toHaveLength(1); // nothing written
  });

  it("the second of two identical submissions is rejected as an overlap", () => {
    const req = { clubId: "acm", roomId: "LIB-286", facts: cleanFacts(), attested: false, requestText: null, draft: null, writer: null };
    expect(createBooking(req).ok).toBe(true);
    const second = createBooking({ ...req, clubId: "study" });
    expect(second.ok).toBe(false);
    expect(!second.ok && second.errors.map((e) => e.ruleId)).toContain("BOOK-01");
    expect(bookings()).toHaveLength(1);
  });

  it("enforces the daily cap across bookings at commit time", () => {
    store.bookings = [booking({ roomId: "TH-326", startTime: "09:00", endTime: "11:00", clubId: "acm" })];
    const res = createBooking({ clubId: "acm", roomId: "LIB-286", facts: cleanFacts(), attested: false, requestText: null, draft: null, writer: null });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors.map((e) => e.ruleId)).toContain("CAP-DAILY-01");
  });

  it("books the room in the request, not the facts' requested room", () => {
    const facts = cleanFacts({ food: true, requestedRoomId: "CCSC-204" });
    const res = createBooking({ clubId: "acm", roomId: "TH-326", facts, attested: false, requestText: null, draft: null, writer: null });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors.map((e) => e.ruleId)).toContain("FOOD-01");
  });

  it("refuses defaulted facts until attested", () => {
    const facts = asDefault(cleanFacts(), "minors");
    const req = { clubId: "acm", roomId: "LIB-286", facts, attested: false, requestText: null, draft: null, writer: null };
    const res = createBooking(req);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors[0].ruleId).toBe("INFO-01");
    expect(createBooking({ ...req, attested: true }).ok).toBe(true);
  });

  it("refuses unresolved safety fields even when attested", () => {
    const res = createBooking({ clubId: "acm", roomId: "LIB-286", facts: cleanFacts({ alcohol: null }), attested: true, requestText: null, draft: null, writer: null });
    expect(res.ok).toBe(false);
    expect(bookings()).toHaveLength(0);
  });

  it("rejects unknown rooms", () => {
    const res = createBooking({ clubId: "acm", roomId: "NOPE-1", facts: cleanFacts(), attested: false, requestText: null, draft: null, writer: null });
    expect(res).toMatchObject({ ok: false, decision: null });
  });

  it("Tier 3 requests are held for review, not confirmed", () => {
    const res = createBooking({ clubId: "premed", roomId: "BUS-120", facts: cleanFacts({ headcount: 150 }), attested: false, requestText: null, draft: null, writer: null });
    expect(res.ok && res.booking.status).toBe("pending_review");
  });
});
