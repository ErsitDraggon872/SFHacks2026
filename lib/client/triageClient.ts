/**
 * Client data access. OWNER: C1.
 * - `?fixture=<name>` in the URL always serves fixtures/triage-<name>.json (for UI work).
 * - NEXT_PUBLIC_USE_FIXTURES=1 serves preset requests from fixtures (no server needed).
 * - Otherwise everything goes to the API routes.
 */
import seedBookings from "@/data/bookings.seed.json";
import dance from "@/fixtures/triage-dance.json";
import pizzaFixed from "@/fixtures/triage-pizza-fixed.json";
import pizza from "@/fixtures/triage-pizza.json";
import speaker from "@/fixtures/triage-speaker.json";
import study from "@/fixtures/triage-study.json";
import type { Booking, BookingRequest, CreateBookingResult, ISODate, TriageRequest, TriageResponse } from "@/lib/types";

export const FIXTURES = {
  study: study as unknown as TriageResponse,
  pizza: pizza as unknown as TriageResponse,
  "pizza-fixed": pizzaFixed as unknown as TriageResponse,
  speaker: speaker as unknown as TriageResponse,
  dance: dance as unknown as TriageResponse,
};
export type FixtureName = keyof typeof FIXTURES;

export const USE_FIXTURES = process.env.NEXT_PUBLIC_USE_FIXTURES === "1";

/** Fixture requested via `?fixture=` (client only). */
export function fixtureFromUrl(): FixtureName | null {
  if (typeof window === "undefined") return null;
  const name = new URLSearchParams(window.location.search).get("fixture");
  return name && name in FIXTURES ? (name as FixtureName) : null;
}

/** `?live=1` makes preset buttons call Gemini instead of replaying the demo cache (client only). */
export function liveFromUrl(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("live") === "1";
}

export class ApiError extends Error {}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function triage(req: TriageRequest): Promise<TriageResponse> {
  if (USE_FIXTURES && req.presetId) return structuredClone(FIXTURES[req.presetId]);
  const res = await fetch("/api/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  return json<TriageResponse>(res);
}

/** Bookings on a date, used to re-run evaluate() locally after the date changes. */
export async function fetchAvailability(date: ISODate): Promise<Booking[]> {
  if (USE_FIXTURES || fixtureFromUrl()) return (seedBookings as Booking[]).filter((b) => b.date === date);
  return json<Booking[]>(await fetch(`/api/availability?date=${encodeURIComponent(date)}`));
}

/** A club's own bookings, soonest first ("My bookings"). */
export async function fetchClubBookings(clubId: string): Promise<Booking[]> {
  if (USE_FIXTURES) return (seedBookings as Booking[]).filter((b) => b.clubId === clubId);
  return json<Booking[]>(await fetch(`/api/bookings?clubId=${encodeURIComponent(clubId)}`));
}

/** Club cancels one of its own bookings; returns the updated (status "cancelled") booking. */
export async function cancelClubBooking(id: string, clubId: string): Promise<Booking> {
  const res = await fetch("/api/bookings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, clubId, action: "cancel" }),
  });
  return (await json<{ booking: Booking }>(res)).booking;
}

/** Always hits the server: booking is re-validated there no matter what the client decided. */
export async function submitBooking(req: BookingRequest): Promise<CreateBookingResult> {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  // 409 carries a CreateBookingResult with errors, so read the body either way
  const body = await res.json().catch(() => null);
  if (!body) throw new ApiError(`Booking failed (${res.status})`);
  if (!res.ok && !("ok" in body)) throw new ApiError(body.error ?? `Booking failed (${res.status})`);
  return body as CreateBookingResult;
}
