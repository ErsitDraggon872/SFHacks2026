"use client";
/**
 * /admin — SA&E review queue. OWNER: C3 (C1 placeholder: replace the body, keep TopBar + tokens).
 * Build: pending Tier 3 briefings (Approve / Deny → POST /api/admin), decision-snapshot audit log
 * (AI value vs user correction), counts, and the labeled time-saved estimate. See docs/handoff-3-ai-admin.md.
 */
import { useEffect, useState } from "react";
import { PolicyBanner } from "@/components/PolicyBanner";
import { TopBar } from "@/components/TopBar";
import { Placeholder } from "@/components/ui";
import type { AdminResponse } from "@/lib/types";

export default function AdminPage() {
  const [data, setData] = useState<AdminResponse | null>(null);
  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  return (
    <>
      <TopBar />
      <PolicyBanner />
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-2 text-muted">Student Activities &amp; Events</p>
        <div className="mt-8">
          <Placeholder name="AdminQueue">
            {data
              ? `${data.pending.length} pending · ${data.counts.autoApproved} auto-approved · ${data.counts.permitAssisted} permit-assisted · ${data.counts.escalated} escalated`
              : "loading…"}
          </Placeholder>
        </div>
      </main>
    </>
  );
}
