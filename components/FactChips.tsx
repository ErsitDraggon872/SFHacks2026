"use client";
/**
 * FactChips — OWNER: C2. "Here's what we understood" row under the search box.
 *
 * Renders one chip per meaningful fact: attendees, date + time, food, sound, guests, speakers,
 * equipment, building, plus alcohol/minors only when not false.
 * Three visual styles, chosen by `facts[field].source`:
 *   - "ai":      neutral pill
 *   - "user":    accent pill with a small pencil icon ("edited")
 *   - "default": outline (dashed) pill prefixed "Assumed:" (e.g. "Assumed: no alcohol")
 * A null tri-state shows as an amber "? Food" chip.
 * Clicking a chip opens an inline editor (TriToggle for tri-state, Input for number/time/date,
 * Select for building) → call onEdit(field, value). Escape cancels. Keyboard accessible.
 * Use `original` to show the AI's value in a tooltip when the user changed it.
 * Helpers: FACT_LABEL / fmtFactValue in lib/client/format.ts. Primitives: PillButton, TriToggle, Input.
 */
import { Placeholder } from "@/components/ui";
import { FACT_LABEL, fmtFactValue } from "@/lib/client/format";
import type { EditFact } from "@/lib/client/uiTypes";
import type { EventFacts, FactField } from "@/lib/types";

export interface FactChipsProps {
  facts: EventFacts;
  /** Facts as first produced by the AI/defaults (before user edits). Null for Quick Filters. */
  original: EventFacts | null;
  onEdit: EditFact;
}

const SHOWN: FactField[] = ["headcount", "date", "startTime", "endTime", "food", "amplifiedSound", "externalGuests", "avNeeds", "preferredBuilding"];

export function FactChips({ facts }: FactChipsProps) {
  return (
    <Placeholder name="FactChips">
      {SHOWN.map((k) => `${FACT_LABEL[k]}: ${fmtFactValue(k, facts[k].value)} (${facts[k].source})`).join(" · ")}
    </Placeholder>
  );
}
