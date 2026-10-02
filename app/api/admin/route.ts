/**
 * GET /api/admin → AdminResponse · POST /api/admin { snapshotId, action } — OWNER: C3 (stub by C1, functional).
 */
import { listSnapshots, setSnapshotStatus } from "@/lib/snapshot";
import type { AdminActionRequest, AdminResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const log = listSnapshots();
  const body: AdminResponse = {
    pending: log.filter((s) => s.status === "pending_review"),
    log,
    counts: {
      autoApproved: log.filter((s) => s.status === "auto_approved").length,
      permitAssisted: log.filter((s) => s.status === "permit_pending").length,
      escalated: log.filter((s) => s.tier === 3).length,
    },
  };
  return Response.json(body);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AdminActionRequest | null;
  if (!body?.snapshotId || !["approve", "deny"].includes(body.action)) {
    return Response.json({ error: "snapshotId and action (approve|deny) required" }, { status: 400 });
  }
  const snap = setSnapshotStatus(body.snapshotId, body.action, body.message);
  if (!snap) return Response.json({ error: "Snapshot not found, or the club already cancelled this booking" }, { status: 404 });
  return Response.json(snap);
}
