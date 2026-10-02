"use client";
/**
 * PolicyExcerptModal — OWNER: C2. Opens when a rule id citation is clicked.
 * Uses the Modal primitive: title "<id> · <title>", the excerpt text, office, effect as a Pill
 * (BLOCK_ROOM "Room restriction", BLOCK_REQUEST "Request limit", REQUIRE_PERMIT "Permit",
 * WARN "Advisory", ESCALATE "Staff review"), and the illustrative-policy note.
 */
import { Modal } from "@/components/ui";
import { POLICY_BY_ID } from "@/lib/data";

export function PolicyExcerptModal({ ruleId, onClose }: { ruleId: string | null; onClose: () => void }) {
  const rule = ruleId ? POLICY_BY_ID[ruleId] : null;
  return (
    <Modal open={!!rule} onClose={onClose} title={rule ? `${rule.id} · ${rule.title}` : ""}>
      {rule && <p>{rule.excerpt}</p>}
    </Modal>
  );
}
