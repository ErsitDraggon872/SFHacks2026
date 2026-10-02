/**
 * POST /api/bookings — OWNER: C3 (stub by C1, functional).
 * createBooking() re-validates everything server-side; a snapshot is saved for every booking.
 * 200 → { ok: true, booking, decision } · 409 → { ok: false, errors, decision }
 * PATCH /api/bookings → club cancels its own booking (frees the room + daily-cap minutes).
 * GET /api/bookings?clubId=acm → that club's Booking[], soonest first ("My bookings").
 */
import { cancelBooking, createBooking } from "@/lib/booking";
import { readCollection } from "@/lib/db";
import { markSnapshotCancelled, saveSnapshot } from "@/lib/snapshot";
import type { Booking, BookingRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const clubId = new URL(request.url).searchParams.get("clubId");
  if (!clubId) return Response.json({ error: "clubId required" }, { status: 400 });
  const mine = readCollection<Booking>("bookings")
    .filter((b) => b.clubId === clubId)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  return Response.json(mine);
}

/** PATCH /api/bookings { id, clubId, action: "cancel" } → 200 { ok, booking } · 404/409 { ok: false, error } */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string; clubId?: string; action?: string } | null;
  if (!body?.id || !body.clubId || body.action !== "cancel") {
    return Response.json({ error: 'id, clubId and action: "cancel" are required' }, { status: 400 });
  }
  const result = cancelBooking(body.id, body.clubId);
  if (!result.ok) return Response.json(result, { status: result.status });
  markSnapshotCancelled(result.booking.id);
  return Response.json(result);
}

export async function POST(request: Request) {
  const req = (await request.json().catch(() => null)) as BookingRequest | null;
  if (!req?.clubId || !req.roomId || !req.facts) {
    return Response.json({ error: "clubId, roomId and facts are required" }, { status: 400 });
  }
  const result = createBooking(req);
  if (!result.ok) return Response.json(result, { status: 409 });
  const snapshot = saveSnapshot(req, result.booking, result.decision);
  return Response.json({ ...result, booking: { ...result.booking, snapshotId: snapshot.id } });
}
