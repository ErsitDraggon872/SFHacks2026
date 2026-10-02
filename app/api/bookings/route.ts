/**
 * POST /api/bookings — OWNER: C3 (stub by C1, functional).
 * createBooking() re-validates everything server-side; a snapshot is saved for every booking.
 * 200 → { ok: true, booking, decision } · 409 → { ok: false, errors, decision }
 */
import { createBooking } from "@/lib/booking";
import { saveSnapshot } from "@/lib/snapshot";
import type { BookingRequest } from "@/lib/types";

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
