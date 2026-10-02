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
import { ArrowRight, Sparkles } from "lucide-react";
import { Button, Card, Checkbox, Pill, SectionLabel, StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import { FACT_LABEL, fmtDate, fmtTime } from "@/lib/client/format";
import { ROOM_BY_ID, ruleLabel } from "@/lib/data";
import { avLabel } from "@/lib/rank";
import type { CreateBookingResult, PolicyDecision, Room, RuleStatus, WriterOutput } from "@/lib/types";

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
  /** Render the attestation, submit button, and booking result here. The request page passes false and uses ConfirmBar instead. */
  showActions?: boolean;
}

function bannerStatus(decision: PolicyDecision): RuleStatus {
  if (decision.tier === 3) return "escalate";
  if (decision.hardBlocks.length > 0) return "block";
  if (decision.suggestedRoomId || decision.unresolved.length > 0) return "warn";
  if (decision.permitsRequired.length > 0 && !decision.canSubmit) return "permit";
  return "pass";
}

function suggestedWhy(room: Room): string {
  const parts: string[] = [`Seats ${room.seats}`];
  if (room.foodAllowed) parts.push("food permitted");
  if (room.av.length > 0) parts.push(room.av.slice(0, 3).map(avLabel).join(", "));
  if (room.adaAccessible) parts.push("accessible");
  return parts.join(" · ");
}

const BOOKING_STATUS_LABEL: Record<string, { label: string; status: RuleStatus; pillTone: "pass" | "warn" | "escalate" }> = {
  confirmed: { label: "Booked · Confirmed", status: "pass", pillTone: "pass" },
  pending_permit: { label: "Booked · pending permit", status: "permit", pillTone: "warn" },
  pending_review: { label: "Sent for review · pending staff review", status: "escalate", pillTone: "escalate" },
};

export function TierPanel({
  decision,
  targetRoom,
  suggestedRoom,
  writer,
  attested,
  onAttest,
  onFix,
  onSubmit,
  submitting,
  result,
  showActions = true,
}: TierPanelProps) {
  const isTier3 = decision.tier === 3;
  const status = bannerStatus(decision);
  const assumedList = decision.defaultsToAttest.map((f) => FACT_LABEL[f].toLowerCase()).join(", ");
  const hasHardBlocks = decision.hardBlocks.length > 0;

  return (
    <Card
      emphasis={decision.tier !== 3}
      className={cn(
        "p-5 transition-colors",
        isTier3 && "border-escalate/25 bg-escalate-soft",
      )}
    >
      {/* Top banner row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <StatusIcon status={status} className="mt-0.5 h-5 w-5" />
          <div className="space-y-1">
            {isTier3 && (
              <div className="text-xs font-semibold uppercase tracking-wide text-escalate">
                Staff review required
              </div>
            )}
            <h2 className="text-base font-semibold tracking-tight text-ink">
              {decision.headline}
            </h2>
            {writer?.explanation && (
              <p className="text-sm leading-relaxed text-ink-2">{writer.explanation}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {decision.tier === 1 && (
            <Pill tone="pass" icon={<StatusIcon status="pass" className="h-3.5 w-3.5" />}>
              Auto-approved — no staff review needed
            </Pill>
          )}
          {decision.tier === 2 && !hasHardBlocks && (
            <Pill tone={decision.suggestedRoomId ? "warn" : "pass"}>
              {decision.suggestedRoomId ? "Tier 2 · 1-click fix" : "Tier 2 · Permit-assisted"}
            </Pill>
          )}
          {decision.tier === 3 && (
            <Pill tone="escalate">Tier 3 · SA&amp;E review</Pill>
          )}
        </div>
      </div>

      {/* Hard blocks (e.g. CAP-DAILY-01 daily limit) */}
      {hasHardBlocks && (
        <div role="alert" className="mt-4 space-y-2 rounded-xl border border-block/20 bg-block-soft p-3.5">
          {decision.hardBlocks.map((b) => (
            <div key={b.ruleId} className="flex items-start justify-between gap-3 text-sm text-block">
              <div className="flex items-start gap-2">
                <StatusIcon status="block" className="mt-0.5" />
                <span className="font-medium">{b.message}</span>
              </div>
              <Pill tone="block" className="shrink-0">
                {ruleLabel(b.ruleId)}
              </Pill>
            </div>
          ))}
        </div>
      )}

      {/* Tier 2 HERO: Fix It callout */}
      {decision.tier === 2 && decision.suggestedRoomId && suggestedRoom && !hasHardBlocks && (
        <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-line-strong bg-subtle p-4 sm:flex-row sm:items-center">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              <span>Recommended fix: {suggestedRoom.name}</span>
            </div>
            <p className="text-xs text-muted">{suggestedWhy(suggestedRoom)}</p>
          </div>
          <Button variant="secondary" onClick={onFix} className="shrink-0 border-ink text-ink hover:bg-sunken">
            Fix it: switch to {suggestedRoom.name}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      {/* Tier 3: Staff review briefing details (NO Fix It) */}
      {isTier3 && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
          <SectionLabel>GatorSpace prepared for Student Activities &amp; Events</SectionLabel>

          {writer?.briefing?.summary && (
            <p className="text-sm text-ink-2">{writer.briefing.summary}</p>
          )}

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted">Room candidate</div>
              <div className="mt-0.5 font-medium text-ink">
                {targetRoom
                  ? `${targetRoom.name} (${targetRoom.seats} seats · fire cap ${targetRoom.fireCapacity})`
                  : "Requires custom space coordination"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted">Policy citations</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {decision.eventFlags.map((f) => (
                  <Pill key={f.ruleId} tone="escalate">
                    {ruleLabel(f.ruleId)}
                  </Pill>
                ))}
              </div>
            </div>
          </div>

          {writer?.briefing && writer.briefing.riskPoints.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-medium text-muted">Key review points</div>
              <ul className="space-y-1 text-sm text-ink-2">
                {writer.briefing.riskPoints.map((rp, idx) => (
                  <li key={`${rp.ruleId}-${idx}`} className="flex items-start gap-2">
                    <Pill tone="escalate" className="mt-0.5 shrink-0">
                      {ruleLabel(rp.ruleId)}
                    </Pill>
                    <span>{rp.point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {writer?.briefing && writer.briefing.staffQuestions.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-xs font-medium text-muted">Questions prepared for reviewer</div>
              <ul className="list-inside list-disc space-y-1 text-sm text-ink-2">
                {writer.briefing.staffQuestions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Attestation & Primary Submit Action (hidden if hardBlocks) */}
      {showActions && !hasHardBlocks && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            {decision.defaultsToAttest.length > 0 && (
              <Checkbox checked={attested} onChange={onAttest}>
                I confirm: no {assumedList}
              </Checkbox>
            )}
            {decision.tier === 2 && decision.permitsRequired.length > 0 && (
              <p className="text-xs text-muted">
                Permit will be filed with {decision.permitsRequired.map((p) => p.office).join(" & ")}
              </p>
            )}
          </div>

          <Button
            variant="primary"
            disabled={!decision.canSubmit || submitting || !!result?.ok}
            onClick={onSubmit}
            className="shrink-0"
          >
            {submitting
              ? "Submitting…"
              : isTier3
                ? "Send to Student Activities & Events"
                : targetRoom
                  ? `Book ${targetRoom.name}`
                  : "Book room"}
          </Button>
        </div>
      )}

      {/* Post-submit Result */}
      {showActions && result && (
        <div
          role="status"
          className={cn(
            "mt-4 rounded-xl border p-3.5 text-sm",
            result.ok
              ? "border-pass/25 bg-pass-soft text-ink"
              : "border-block/25 bg-block-soft text-block",
          )}
        >
          {result.ok ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusIcon
                  status={BOOKING_STATUS_LABEL[result.booking.status]?.status ?? "pass"}
                />
                <span className="font-medium">
                  {ROOM_BY_ID[result.booking.roomId]?.name ?? result.booking.roomId}
                </span>
                <span className="text-ink-2">
                  · {fmtDate(result.booking.date)} · {fmtTime(result.booking.startTime)}–
                  {fmtTime(result.booking.endTime)}
                </span>
              </div>
              <Pill tone={BOOKING_STATUS_LABEL[result.booking.status]?.pillTone ?? "pass"}>
                {BOOKING_STATUS_LABEL[result.booking.status]?.label ?? result.booking.status}
              </Pill>
            </div>
          ) : (
            <ul className="space-y-1">
              {result.errors.map((err, i) => (
                <li key={`${err.ruleId}-${i}`} className="flex items-start gap-2">
                  <StatusIcon status="block" className="mt-0.5" />
                  <span>
                    <strong className="text-xs">{ruleLabel(err.ruleId)}:</strong> {err.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

