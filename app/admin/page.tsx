"use client";

import { useEffect, useState } from "react";
import { AdminQueue } from "@/components/AdminQueue";
import { PolicyBanner } from "@/components/PolicyBanner";
import { TopBar } from "@/components/TopBar";
import type { AdminResponse } from "@/lib/types";

export default function AdminPage() {
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin");
      if (res.ok) {
        const json: AdminResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load admin queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
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
