"use client";
/**
 * ClubSwitcher — OWNER: C2. Top-bar "Acting as" control (mock for verified-org SSO).
 * Compact select/menu: muted "Acting as" + club.short, chevron. Lists `clubs` by name.
 * onChange(clubId). Accessible name "Acting as organization".
 */
import { ChevronDown } from "lucide-react";
import type { Club } from "@/lib/types";

export interface ClubSwitcherProps {
  clubs: Club[];
  clubId: string;
  onChange: (clubId: string) => void;
}

export function ClubSwitcher({ clubs, clubId, onChange }: ClubSwitcherProps) {
  return (
    <div className="relative inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs transition-colors hover:bg-subtle">
      <span className="mr-1.5 text-muted">Acting as</span>
      <select
        aria-label="Acting as organization"
        value={clubId}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-4 font-medium text-ink outline-none"
      >
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.short} — {c.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-muted"
      />
    </div>
  );
}

