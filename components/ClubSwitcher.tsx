"use client";
/**
 * ClubSwitcher — OWNER: C2. Top-bar "Acting as" control (mock for verified-org SSO).
 * Compact select/menu: muted "Acting as" + club.short, chevron. Lists `clubs` by name.
 * onChange(clubId). Accessible name "Acting as organization".
 */
import type { Club } from "@/lib/types";

export interface ClubSwitcherProps {
  clubs: Club[];
  clubId: string;
  onChange: (clubId: string) => void;
}

export function ClubSwitcher({ clubs, clubId, onChange }: ClubSwitcherProps) {
  // functional stub so the page works today; C2 restyles
  return (
    <select
      aria-label="Acting as organization"
      value={clubId}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-dashed border-line-strong bg-subtle px-3 py-1 text-sm"
    >
      {clubs.map((c) => (
        <option key={c.id} value={c.id}>
          {c.short}
        </option>
      ))}
    </select>
  );
}
