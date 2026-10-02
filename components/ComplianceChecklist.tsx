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
import { StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import type { PolicyRuleResult, RuleStatus } from "@/lib/types";
import { ruleLabel } from "@/lib/data";

export interface ComplianceChecklistProps {
  results: PolicyRuleResult[];
  onCite: (ruleId: string) => void;
}

const STATUS_ORDER: Record<RuleStatus, number> = {
  block: 0,
  escalate: 1,
  permit: 2,
  warn: 3,
  info: 4,
  pass: 5,
};

export function ComplianceChecklist({ results, onCite }: ComplianceChecklistProps) {
  const sorted = [...results].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  return (
    <ul
      aria-label="Policy compliance checklist"
      className="divide-y divide-line rounded-2xl border border-line bg-surface"
    >
      {sorted.map((r) => (
        <li
          key={`${r.ruleId}-${r.status}`}
          className={cn(
            "gs-rise flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm",
            r.status === "block" && "bg-block-soft/50",
            r.status === "escalate" && "bg-escalate-soft/50",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <StatusIcon status={r.status} />
            <span className="font-medium text-ink">{r.title}</span>
            <span className="truncate text-muted">{r.detail}</span>
          </div>
          <button
            type="button"
            onClick={() => onCite(r.ruleId)}
            aria-label={`View ${ruleLabel(r.ruleId)} policy`}
            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-ink-2 underline decoration-line-strong underline-offset-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            {ruleLabel(r.ruleId)}
          </button>
        </li>
      ))}
    </ul>
  );
}

