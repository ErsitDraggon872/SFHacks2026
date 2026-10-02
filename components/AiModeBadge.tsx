"use client";
/**
 * AiModeBadge — OWNER: C2. Tiny, unobtrusive indicator near the search box.
 * "live" → dot + "AI: Live"; "cached" → "AI: Cached demo" (preset replay);
 * "fallback" → "AI: Demo fallback" (Gemini failed); "none" → nothing (Quick Filters).
 */
import { cn } from "@/lib/client/cn";
import type { AiMode } from "@/lib/types";

const LABEL: Record<Exclude<AiMode, "none">, { text: string; aria: string }> = {
  live: { text: "Live", aria: "AI mode: Live Gemini model" },
  cached: { text: "Cached demo", aria: "AI mode: Cached demo extraction" },
  fallback: { text: "Demo fallback", aria: "AI mode: Demo fallback, Gemini unavailable" },
};

export function AiModeBadge({ mode }: { mode: AiMode }) {
  if (mode === "none") return null;
  const isLive = mode === "live";
  return (
    <span aria-label={LABEL[mode].aria} className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-pass" : "bg-faint")} />
      <span>AI: {LABEL[mode].text}</span>
    </span>
  );
}
