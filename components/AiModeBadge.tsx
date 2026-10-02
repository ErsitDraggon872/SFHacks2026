"use client";
/**
 * AiModeBadge — OWNER: C2. Tiny, unobtrusive indicator near the search box.
 * "live" → dot + "AI: Live"; "fallback" → "AI: Demo fallback"; "none" → nothing (Quick Filters).
 */
import { cn } from "@/lib/client/cn";
import type { AiMode } from "@/lib/types";

export function AiModeBadge({ mode }: { mode: AiMode }) {
  if (mode === "none") return null;
  const isLive = mode === "live";
  return (
    <span
      aria-label={isLive ? "AI mode: Live Gemini model" : "AI mode: Demo fallback cache"}
      className="inline-flex items-center gap-1.5 text-xs text-muted"
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isLive ? "bg-pass" : "bg-faint",
        )}
      />
      <span>AI: {isLive ? "Live" : "Demo fallback"}</span>
    </span>
  );
}

