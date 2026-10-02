"use client";
/**
 * PermitDraft — OWNER: C2. Pre-filled permit preview (tier 2/3 when decision.permitsRequired).
 *
 * Looks like a clean paper form inside a Card: header "<permit.name>" + muted "<permit.office>",
 * Pill "Pre-filled by SwampReserve". Two-column label/value grid from permit.fields.
 * If `narrative` (writer.permitNarrative) is present, show it under "Event description".
 * Footer muted note: "Fields were filled from your request. You can review them before it's filed."
 * Read-only for the demo.
 */
import { FileText } from "lucide-react";
import { Card, Pill } from "@/components/ui";
import type { PermitRequirement } from "@/lib/types";
import { ruleLabel } from "@/lib/data";

export interface PermitDraftProps {
  permit: PermitRequirement;
  narrative: string | null;
}

export function PermitDraft({ permit, narrative }: PermitDraftProps) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3.5">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-ink">{permit.name}</h3>
            <p className="text-xs text-muted">{permit.office} · {ruleLabel(permit.ruleId)}</p>
          </div>
        </div>
        <Pill tone="neutral">Pre-filled by SwampReserve</Pill>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {permit.fields.map((f) => (
          <div key={f.label} className="space-y-0.5">
            <dt className="text-xs font-medium text-muted">{f.label}</dt>
            <dd className="font-medium text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      {narrative && (
        <div className="mt-4 border-t border-line pt-3.5">
          <div className="text-xs font-medium text-muted">Event description</div>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{narrative}</p>
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        Fields were filled from your request. You can review them before it&apos;s filed.
      </p>
    </Card>
  );
}

