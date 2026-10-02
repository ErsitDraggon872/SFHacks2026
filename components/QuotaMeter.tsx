"use client";
/**
 * QuotaMeter — OWNER: C2. Daily booking limit pill in the top bar: "2.0 / 3.0 hrs today".
 * Thin progress bar: used (ink) + this request (striped/accent) out of cap.
 * Tone turns block when used + request > cap. aria-label with the full sentence.
 * usedMin === null → show "3 hr daily limit" (no date chosen yet).
 */
import { StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import { fmtMinutes } from "@/lib/client/format";

export interface QuotaMeterProps {
  usedMin: number | null;
  requestMin: number | null;
  capMin: number;
}

export function QuotaMeter({ usedMin, requestMin, capMin }: QuotaMeterProps) {
  if (usedMin === null) {
    return (
      <span
        aria-label={`Daily booking limit: ${fmtMinutes(capMin)}`}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3 py-1 text-xs font-medium text-muted"
      >
        {fmtMinutes(capMin)} daily limit
      </span>
    );
  }

  const req = Math.max(0, requestMin ?? 0);
  const total = usedMin + req;
  const over = total > capMin;
  const usedPct = Math.min(100, (usedMin / capMin) * 100);
  const reqPct = Math.min(100 - usedPct, (req / capMin) * 100);
  const labelText = `${fmtMinutes(total)} / ${fmtMinutes(capMin)} today`;
  const ariaLabel = `Daily booking quota: ${fmtMinutes(usedMin)} already booked plus ${fmtMinutes(req)} requested out of ${fmtMinutes(capMin)} daily limit${over ? " (exceeds daily limit)" : ""}`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        over
          ? "border-block/30 bg-block-soft text-block"
          : "border-line bg-subtle text-ink-2",
      )}
    >
      {over && <StatusIcon status="block" className="h-3.5 w-3.5" />}
      <span>{labelText}</span>
      <span
        aria-hidden
        className="flex h-1.5 w-12 overflow-hidden rounded-full bg-line"
      >
        <span
          className={cn("h-full transition-all", over ? "bg-block" : "bg-ink")}
          style={{ width: `${usedPct}%` }}
        />
        <span
          className={cn("h-full transition-all", over ? "bg-block" : "bg-accent")}
          style={{ width: `${reqPct}%` }}
        />
      </span>
    </span>
  );
}

