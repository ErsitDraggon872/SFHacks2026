"use client";
/**
 * QuickFilters — OWNER: C2. The no-AI entry path (the "Filters" tab of SearchHero).
 *
 * Compact form building EventFacts directly (all source "user"):
 *   Date (input type=date), Start / End (type=time), Attendees (number),
 *   Equipment (toggle pills for projector, display, microphone, speakers, whiteboard, computers),
 *   Building (Select of unique ROOMS buildings, "Any"),
 *   Food / Amplified sound / Non-SFSU guests / Guest speakers / Alcohol / Under 18 (TriToggle each),
 *   Accessible space (Checkbox).
 * Every change → onChange(nextFacts) via setFact() from lib/normalize.ts.
 * Primary "Find rooms" → onSubmit (the page then evaluates locally — instant, no network).
 * Two-column grid on desktop, one column on mobile.
 */
import { Placeholder } from "@/components/ui";
import type { EventFacts } from "@/lib/types";

export interface QuickFiltersProps {
  value: EventFacts;
  onChange: (facts: EventFacts) => void;
  onSubmit: () => void;
}

export function QuickFilters({ onSubmit }: QuickFiltersProps) {
  return (
    <Placeholder name="QuickFilters">
      <button className="underline" onClick={onSubmit}>
        find rooms (uses current values)
      </button>
    </Placeholder>
  );
}
