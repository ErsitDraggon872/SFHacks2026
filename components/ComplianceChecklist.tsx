"use client";
/**
 * ComplianceChecklist — OWNER: C2. Policy rows for the target room (decision.applicableRules).
 *
 * One row per result: StatusIcon(status) · rule title · muted detail · citation link.
 *   e.g.  ✓ Fire marshal capacity   45 attendees ≤ 70 fire capacity   CAP-01
 * The rule id is a small mono text button → onCite(ruleId) (page opens PolicyExcerptModal).
 * Order: block, escalate, permit, warn, info, pass. Hairline dividers between rows.
 * Use `animateKey` to briefly highlight rows whose status changed (e.g. FOOD-01 block → pass after Fix It).
 */
import { Placeholder } from "@/components/ui";
import type { PolicyRuleResult } from "@/lib/types";

export interface ComplianceChecklistProps {
  results: PolicyRuleResult[];
  onCite: (ruleId: string) => void;
}

export function ComplianceChecklist({ results }: ComplianceChecklistProps) {
  return <Placeholder name="ComplianceChecklist">{results.map((r) => `${r.status} ${r.ruleId}`).join(" · ")}</Placeholder>;
}
