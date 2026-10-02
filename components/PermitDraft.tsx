"use client";
/**
 * PermitDraft — OWNER: C2. Pre-filled permit preview (tier 2/3 when decision.permitsRequired).
 *
 * Looks like a clean paper form inside a Card: header "<permit.name>" + muted "<permit.office>",
 * Pill "Pre-filled by GatorSpace". Two-column label/value grid from permit.fields.
 * If `narrative` (writer.permitNarrative) is present, show it under "Event description".
 * Footer muted note: "Fields were filled from your request. You can review them before it's filed."
 * Read-only for the demo.
 */
import { Placeholder } from "@/components/ui";
import type { PermitRequirement } from "@/lib/types";

export interface PermitDraftProps {
  permit: PermitRequirement;
  narrative: string | null;
}

export function PermitDraft({ permit }: PermitDraftProps) {
  return <Placeholder name="PermitDraft">{permit.name}: {permit.fields.map((f) => `${f.label}=${f.value}`).join(", ")}</Placeholder>;
}
