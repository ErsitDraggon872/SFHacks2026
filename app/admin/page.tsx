"use client";
/**
 * /admin — SA&E review queue. OWNER: C3 (C1 placeholder: replace the body, keep TopBar + tokens).
 * Build: pending Tier 3 briefings (Approve / Deny → POST /api/admin), decision-snapshot audit log
 * (AI value vs user correction), counts, and the labeled time-saved estimate. See docs/handoff-3-ai-admin.md.
 */
import { useEffect, useState } from "react";
import { AdminQueue } from "@/components/AdminQueue";
import { PolicyBanner } from "@/components/PolicyBanner";
import { TopBar } from "@/components/TopBar";
import type { AdminResponse } from "@/lib/types";

export default function AdminPage() {
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <TopBar />
      <PolicyBanner />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">SA&amp;E Review Queue</h1>
          <p className="mt-1 text-sm text-muted">
            Student Activities &amp; Events · Automated policy triage &amp; reservation oversight
          </p>
        </header>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-sunken" />
            ))}
          </div>
        ) : (
          <AdminQueue initialData={data} />
        )}
      </main>
    </>
  );
}
