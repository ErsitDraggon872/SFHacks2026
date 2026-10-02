"use client";
/**
 * PolicyExcerptModal — OWNER: C2. Opens when a rule id citation is clicked.
 * Uses the Modal primitive: title "<id> · <title>", the excerpt text, office, effect as a Pill
 * (BLOCK_ROOM "Room restriction", BLOCK_REQUEST "Request limit", REQUIRE_PERMIT "Permit",
 * WARN "Advisory", ESCALATE "Staff review"), and the illustrative-policy note.
 */
import { Modal, Pill, type PillTone } from "@/components/ui";
import { POLICY_BY_ID } from "@/lib/data";
import type { PolicyEffect } from "@/lib/types";

const EFFECT_META: Record<PolicyEffect, { label: string; tone: PillTone }> = {
  BLOCK_ROOM: { label: "Room restriction", tone: "block" },
  BLOCK_REQUEST: { label: "Request limit", tone: "block" },
  REQUIRE_PERMIT: { label: "Permit", tone: "warn" },
  WARN: { label: "Advisory", tone: "warn" },
  ESCALATE: { label: "Staff review", tone: "escalate" },
};

export function PolicyExcerptModal({ ruleId, onClose }: { ruleId: string | null; onClose: () => void }) {
  const rule = ruleId ? POLICY_BY_ID[ruleId] : null;
  const meta = rule ? EFFECT_META[rule.effect] : null;

  return (
    <Modal open={!!rule} onClose={onClose} title={rule ? `${rule.id} · ${rule.title}` : ""}>
      {rule && meta && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={meta.tone}>{meta.label}</Pill>
            {rule.office && <span className="text-xs text-muted">Office: {rule.office}</span>}
          </div>
          <p className="text-sm leading-relaxed text-ink">{rule.excerpt}</p>
          <p className="border-t border-line pt-2.5 text-xs text-muted">
            Illustrative rule modeled on SFSU campus event workflows; not authoritative university policy.
          </p>
        </div>
      )}
    </Modal>
  );
}

