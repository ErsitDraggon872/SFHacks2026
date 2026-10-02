"use client";
/**
 * TierPanel — OWNER: C2. The heart of the demo. Renders ONLY what `decision` says; it never
 * computes tier or eligibility itself.
 *
 * Always: a one-line banner with StatusIcon + `decision.headline`, plus `writer.explanation`
 * (muted, below) when present.
 *
 * Tier 1 (decision.tier === 1):
 *   - If decision.defaultsToAttest is non-empty: Checkbox "I confirm: no <assumed items>" → onAttest.
 *   - Primary "Book <target room>" → onSubmit. Disabled unless decision.canSubmit.
 *   - Small pass Pill "Auto-approved — no staff review needed".
 *
 * Tier 2:
 *   - If decision.suggestedRoomId: secondary-styled callout "Fix it: switch to <suggestedRoom.name>"
 *     with the room's one-line why; button → onFix. THIS IS THE HERO MOMENT — make it satisfying.
 *   - If decision.hardBlocks: show them (e.g. daily cap) and no Book button.
 *   - Else attestation (same as T1) + primary "Book <target>" → onSubmit (disabled unless canSubmit),
 *     with helper text "Permit will be filed with <office>" when decision.permitsRequired is non-empty.
 *
 * Tier 3:
 *   - Visibly different: escalate-soft background, ShieldAlert icon, title "Staff review required".
 *   - NO Fix It. List "GatorSpace prepared": room candidates, policy citations, event summary,
 *     staff questions (from writer.briefing).
 *   - Primary "Send to Student Activities & Events" → onSubmit (disabled unless canSubmit).
 *
 * After submit (`result`):
 *   - ok → success state: "Booked <room>, <date/time>" / "Sent for review" based on result.booking.status.
 *   - !ok → list result.errors messages (server re-validation failed) in block tone.
 */
import { Placeholder } from "@/components/ui";
import type { CreateBookingResult, PolicyDecision, Room, WriterOutput } from "@/lib/types";

export interface TierPanelProps {
  decision: PolicyDecision;
  targetRoom: Room | null;
  suggestedRoom: Room | null;
  writer: WriterOutput | null;
  attested: boolean;
  onAttest: (v: boolean) => void;
  onFix: () => void;
  onSubmit: () => void;
  submitting: boolean;
  result: CreateBookingResult | null;
}

export function TierPanel({ decision, targetRoom, suggestedRoom, onFix, onSubmit, attested, onAttest, result }: TierPanelProps) {
  return (
    <Placeholder name="TierPanel">
      <div>
        Tier {decision.tier}: {decision.headline}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {decision.suggestedRoomId && (
          <button className="underline" onClick={onFix}>
            Fix it: switch to {suggestedRoom?.name}
          </button>
        )}
        {decision.defaultsToAttest.length > 0 && (
          <label>
            <input type="checkbox" checked={attested} onChange={(e) => onAttest(e.target.checked)} /> attest
          </label>
        )}
        <button className="underline disabled:opacity-40" disabled={!decision.canSubmit} onClick={onSubmit}>
          Submit {targetRoom?.name} ({decision.submitOutcome ?? "not yet"})
        </button>
      </div>
      {result && <div className="mt-2">{result.ok ? `Created ${result.booking.status}` : result.errors.map((e) => e.message).join("; ")}</div>}
    </Placeholder>
  );
}
