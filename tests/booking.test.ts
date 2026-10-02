import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, BookingRequest } from "@/lib/types";
import { asDefault, booking, cleanFacts } from "./helpers";

// In-memory store instead of data/runtime/*.json.
const store: Record<string, unknown[]> = {};
let idSeq = 0;
vi.mock("@/lib/db", () => ({
  readCollection: (name: string) => [...(store[name] ?? [])],
  writeCollection: (name: string, rows: unknown[]) => {
    store[name] = [...rows];
  },
  newId: (prefix: string) => `${prefix}-test-${++idSeq}`,
}));

const { createBooking } = await import("@/lib/booking");

const bookings = () => (store.bookings ?? []) as Booking[];

/** A request for a clean 8-person event in LIB-286 by ACM; override anything. */
const req = (p: Partial<BookingRequest> = {}): BookingRequest => ({
  clubId: "acm",
  roomId: "LIB-286",
  facts: cleanFacts(),
  attested: false,
  requestText: null,
  draft: null,
  writer: null,
  ...p,
});

const errorIds = (res: ReturnType<typeof createBooking>) => (res.ok ? [] : res.errors.map((e) => e.ruleId));

beforeEach(() => {
  store.bookings = [];
  idSeq = 0;
});

describe("createBooking", () => {
  it("writes a confirmed booking for a clean Tier 1 request", () => {
    const res = createBooking(req());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking).toMatchObject({ roomId: "LIB-286", date: "2026-10-08", startTime: "16:00", endTime: "18:00", durationMin: 120, status: "confirmed", tier: 1 });
    expect(bookings()).toEqual([res.booking]);
  });

  it("stores the officer's event name and description, trimmed", () => {
    const res = createBooking(req({ eventName: "  Fall kickoff  ", eventDescription: " Intro night for new members " }));
    expect(res.ok && { title: res.booking.title, description: res.booking.description }).toEqual({
      title: "Fall kickoff",
      description: "Intro night for new members",
    });
  });

  it("falls back to the extracted summary when the event name is blank", () => {
    const res = createBooking(req({ eventName: "   ", eventDescription: "" }));
    expect(res.ok && res.booking.title).toBe(cleanFacts().summary.value ?? "Student organization event");
    expect(res.ok && res.booking.description).toBeNull();
  });

  it("a food event in a food room becomes pending_permit", () => {
    const res = createBooking(req({ roomId: "CCSC-204", facts: cleanFacts({ headcount: 45, food: true }) }));
    expect(res.ok && res.booking.status).toBe("pending_permit");
  });

  it("Tier 3 requests are held for review, not confirmed", () => {
    const res = createBooking(req({ clubId: "premed", roomId: "BUS-120", facts: cleanFacts({ headcount: 150 }) }));
    expect(res.ok && res.booking.status).toBe("pending_review");
  });

  it("revalidates at commit: a room booked after triage is rejected with BOOK-01", () => {
    // someone else grabs CCSC-204 between triage and submit
    store.bookings = [booking({ roomId: "CCSC-204", startTime: "17:00", endTime: "19:00", clubId: "premed" })];
    const res = createBooking(req({ roomId: "CCSC-204", facts: cleanFacts({ headcount: 45, food: true }), attested: true }));
    expect(errorIds(res)).toContain("BOOK-01");
    expect(bookings()).toHaveLength(1); // nothing written
  });

  it("the second of two identical submissions is rejected as an overlap", () => {
    expect(createBooking(req()).ok).toBe(true);
    const second = createBooking(req({ clubId: "study" }));
    expect(errorIds(second)).toContain("BOOK-01");
    expect(bookings()).toHaveLength(1);
  });

  it("enforces the daily cap across bookings at commit time", () => {
    store.bookings = [booking({ roomId: "TH-326", startTime: "09:00", endTime: "11:00", clubId: "acm" })];
    expect(errorIds(createBooking(req()))).toContain("CAP-DAILY-01"); // 120 + 120 > 180
  });

  it("books the room in the request, not the facts' requested room", () => {
    const res = createBooking(req({ roomId: "TH-326", facts: cleanFacts({ food: true, requestedRoomId: "CCSC-204" }) }));
    expect(errorIds(res)).toContain("FOOD-01");
  });

  it("refuses defaulted facts until attested", () => {
    const facts = asDefault(cleanFacts(), "minors");
    expect(errorIds(createBooking(req({ facts })))).toEqual(["INFO-01"]);
    expect(createBooking(req({ facts, attested: true })).ok).toBe(true);
  });

  it("refuses unresolved safety fields even when attested", () => {
    const res = createBooking(req({ facts: cleanFacts({ alcohol: null }), attested: true }));
    expect(errorIds(res)).toContain("INFO-01");
    expect(bookings()).toHaveLength(0);
  });

  it("rejects unknown rooms", () => {
    expect(createBooking(req({ roomId: "NOPE-1" }))).toMatchObject({ ok: false, decision: null });
  });
});
