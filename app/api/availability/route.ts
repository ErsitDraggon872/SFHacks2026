/** GET /api/availability?date=YYYY-MM-DD → Booking[] on that date. OWNER: C3 (stub by C1, complete). */
import { readCollection } from "@/lib/db";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  return Response.json(readCollection<Booking>("bookings").filter((b) => b.date === date));
}
