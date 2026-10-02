"use client";
/**
 * ConfirmBar — OWNER: C1. The commit step, pinned to the bottom of the results so the officer
 * reviews the decision, rooms, and permit first, then attests and books.
 * Every enabled/disabled state comes from decision.canSubmit; this only renders it.
 */
import { Button, Checkbox, Pill, StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import { fmtDate, fmtTime } from "@/lib/client/format";
import { ROOM_BY_ID } from "@/lib/data";
import type { CreateBookingResult, PolicyDecision, Room, SafetyField } from "@/lib/types";

export interface ConfirmBarProps {
  decision: PolicyDecision;
  targetRoom: Room | null;
  attested: boolean;
  onAttest: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  result: CreateBookingResult | null;
}

/** How each defaulted safety field reads in "We assumed: …". */
const ASSUMED_NO: Record<SafetyField, string> = {
  food: "no food",
  amplifiedSound: "no amplified sound",
  externalGuests: "no non-SFSU guests",
  guestSpeakers: "no guest speakers",
  alcohol: "no alcohol",
  minors: "no one under 18",
};

const RESULT_LABEL = {
  confirmed: { label: "Booked · confirmed", tone: "pass" },
  pending_permit: { label: "Booked · permit pending", tone: "warn" },
  pending_review: { label: "Sent for staff review", tone: "escalate" },
} as const;

/** Why the button is disabled, in one short line (null when it isn't). */
function blockedReason(d: PolicyDecision): string | null {
  if (d.hardBlocks.length) return d.hardBlocks[0].message;
  if (d.unresolved.length) return `Answer ${d.unresolved.length === 1 ? "the question" : `the ${d.unresolved.length} questions`} above to continue`;
  if (!d.targetRoomId) return "No room fits this request";
  if (d.suggestedRoomId) return "This room isn't available. Use Fix it or choose another room.";
  const target = d.rooms.find((r) => r.roomId === d.targetRoomId);
  if (target && !target.eligible) return target.conflicts[0]?.message ?? "This room isn't available";
  return null;
}

export function ConfirmBar({ decision: d, targetRoom, attested, onAttest, onSubmit, submitting, result }: ConfirmBarProps) {
  const booked = result?.ok ? result.booking : null;
  const needsAttest = d.defaultsToAttest.length > 0 && !attested;
  const reason = blockedReason(d);
  const isReview = d.tier === 3;

  return (
    <div className="sticky bottom-3 z-10">
      <div
        className={cn(
          "rounded-2xl border bg-surface/95 p-4 shadow-lg backdrop-blur",
          booked ? "border-pass/30" : result && !result.ok ? "border-block/30" : "border-line-strong",
        )}
      >
        {booked ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <StatusIcon status={RESULT_LABEL[booked.status as keyof typeof RESULT_LABEL]?.tone ?? "pass"} />
              <span className="font-medium text-ink">{ROOM_BY_ID[booked.roomId]?.name ?? booked.roomId}</span>
              <span className="text-ink-2">
                · {fmtDate(booked.date)} · {fmtTime(booked.startTime)}–{fmtTime(booked.endTime)}
              </span>
            </div>
            <Pill tone={RESULT_LABEL[booked.status as keyof typeof RESULT_LABEL]?.tone ?? "pass"}>
              {RESULT_LABEL[booked.status as keyof typeof RESULT_LABEL]?.label ?? booked.status}
            </Pill>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              {d.defaultsToAttest.length > 0 && (
                <Checkbox checked={attested} onChange={onAttest}>
                  We assumed: {d.defaultsToAttest.map((f) => ASSUMED_NO[f as SafetyField]).join(", ")}. I confirm this is correct.
                </Checkbox>
              )}
              {reason ? (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <StatusIcon status={d.hardBlocks.length ? "block" : "warn"} className="h-3.5 w-3.5" />
                  {reason}
                </p>
              ) : (
                d.permitsRequired.length > 0 && (
                  <p className="text-xs text-muted">
                    {d.permitsRequired.map((p) => p.name).join(" and ")} will be filed with{" "}
                    {[...new Set(d.permitsRequired.map((p) => p.office))].join(" & ")}
                  </p>
                )
              )}
            </div>
            <Button
              variant="primary"
              disabled={!d.canSubmit || submitting}
              onClick={onSubmit}
              title={needsAttest && !reason ? "Confirm the assumed details first" : undefined}
              className="shrink-0"
            >
              {submitting
                ? "Submitting…"
                : isReview
                  ? "Send to Student Activities & Events"
                  : targetRoom
                    ? `Book ${targetRoom.name}`
                    : "Book room"}
            </Button>
          </div>
        )}

        {result && !result.ok && (
          <ul role="alert" className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-block">
            {result.errors.map((err, i) => (
              <li key={`${err.ruleId}-${i}`} className="flex items-start gap-2">
                <StatusIcon status="block" className="mt-0.5" />
                <span>
                  <strong className="font-mono text-xs">{err.ruleId}:</strong> {err.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
