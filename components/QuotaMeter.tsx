"use client";
/**
 * QuotaMeter — OWNER: C2. Daily booking limit pill in the top bar: "2.0 / 3.0 hrs today".
 * Thin progress bar: used (ink) + this request (striped/accent) out of cap.
 * Tone turns block when used + request > cap. aria-label with the full sentence.
 * usedMin === null → show "3 hr daily limit" (no date chosen yet).
 */
import { fmtMinutes } from "@/lib/client/format";

export interface QuotaMeterProps {
  usedMin: number | null;
  requestMin: number | null;
  capMin: number;
}

export function QuotaMeter({ usedMin, requestMin, capMin }: QuotaMeterProps) {
  const text =
    usedMin === null ? `${fmtMinutes(capMin)} daily limit` : `${fmtMinutes(usedMin + (requestMin ?? 0))} / ${fmtMinutes(capMin)}`;
  return <span className="rounded-full border border-dashed border-line-strong bg-subtle px-3 py-1 text-sm text-ink-2">{text}</span>;
}
