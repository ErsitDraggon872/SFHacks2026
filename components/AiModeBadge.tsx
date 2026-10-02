"use client";
/**
 * AiModeBadge — OWNER: C2. Tiny, unobtrusive indicator near the search box.
 * "live" → dot + "AI: Live"; "fallback" → "AI: Demo fallback"; "none" → nothing (Quick Filters).
 */
import type { AiMode } from "@/lib/types";

export function AiModeBadge({ mode }: { mode: AiMode }) {
  if (mode === "none") return null;
  return <span className="text-xs text-faint">AI: {mode === "live" ? "Live" : "Demo fallback"}</span>;
}
