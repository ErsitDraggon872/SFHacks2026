"use client";
/**
 * RoomCard — OWNER: C2. One room in the ranked list. ResultsList (C1) decides order + variant.
 *
 * variant "best" (rank #1): Card emphasis. "Best match" Pill, room name (large), building · seats ·
 *   fire capacity, "Why #1" line built from ranked.reasons (fit ✓, miss ✕, pref ·), AV list.
 * variant "row" (rank 2–5): single compact row: name · building · seats · ranked.why.
 * variant "unavailable": muted/grayed row; name + each ranked.evaluation.conflicts[].message with
 *   its rule id (block tone). No select button.
 * When isTarget: show a small "Selected" Pill instead of the button.
 * Otherwise (best/row): secondary "Choose" button → onSelect(room.id).
 */
import { Check, X } from "lucide-react";
import { Button, Card, Pill, StatusIcon } from "@/components/ui";
import { cn } from "@/lib/client/cn";
import { avLabel } from "@/lib/rank";
import type { RankedRoom } from "@/lib/types";
import { ruleLabel } from "@/lib/data";

export type RoomCardVariant = "best" | "row" | "unavailable";

export interface RoomCardProps {
  ranked: RankedRoom;
  variant: RoomCardVariant;
  isTarget: boolean;
  onSelect: (roomId: string) => void;
}

export function RoomCard({ ranked, variant, isTarget, onSelect }: RoomCardProps) {
  const { room, evaluation, reasons, why } = ranked;

  if (variant === "best") {
    return (
      <Card emphasis className={cn("p-5", isTarget && "border-ink-2")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="pass" icon={<StatusIcon status="pass" className="h-3.5 w-3.5" />}>
                Best match
              </Pill>
              <span className="text-xs text-muted">
                {room.building} · {room.seats} seats · {room.fireCapacity} fire capacity
              </span>
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">{room.name}</h3>
          </div>

          <div className="flex items-center gap-2">
            {isTarget ? (
              <Pill tone="accent">Selected</Pill>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => onSelect(room.id)}>
                Choose
              </Button>
            )}
          </div>
        </div>

        {/* Why #1 */}
        {reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Why #1</span>
            {reasons.map((r, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1",
                  r.kind === "fit" && "text-ink-2",
                  r.kind === "miss" && "text-warn",
                  r.kind === "pref" && "text-muted",
                )}
              >
                {r.kind === "fit" && <Check className="h-3.5 w-3.5 text-pass" aria-hidden />}
                {r.kind === "miss" && <X className="h-3.5 w-3.5 text-warn" aria-hidden />}
                {r.kind === "pref" && <span aria-hidden>·</span>}
                <span>{r.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* AV & Room Details */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
          <span>Equipment: {room.av.length > 0 ? room.av.map(avLabel).join(", ") : "None"}</span>
          <span>·</span>
          <span>Hours: {room.hours.open}–{room.hours.close}</span>
          {room.foodAllowed && (
            <>
              <span>·</span>
              <span>Food allowed</span>
            </>
          )}
        </div>
      </Card>
    );
  }

  if (variant === "row") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-subtle">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {ranked.rank !== null && (
              <span className="font-mono text-xs text-muted">#{ranked.rank}</span>
            )}
            <span className="font-medium text-ink">{room.name}</span>
            <span className="text-xs text-muted">
              {room.building} · {room.seats} seats
            </span>
          </div>
          {why && <p className="truncate text-xs text-muted">{why}</p>}
        </div>

        <div className="shrink-0">
          {isTarget ? (
            <Pill tone="accent">Selected</Pill>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => onSelect(room.id)}>
              Choose
            </Button>
          )}
        </div>
      </div>
    );
  }

  // variant === "unavailable"
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 text-sm opacity-75 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-muted">{room.name}</span>
          <span className="text-xs text-faint">
            {room.building} · {room.seats} seats (fire cap {room.fireCapacity})
          </span>
          {isTarget && <Pill tone="accent">Selected</Pill>}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {evaluation.conflicts.map((c, idx) => (
            <span key={`${c.ruleId}-${idx}`} className="inline-flex items-center gap-1.5 text-xs text-block">
              <StatusIcon status="block" className="h-3.5 w-3.5" />
              <span>{c.message}</span>
              <Pill tone="block" className="text-[11px]">
                {ruleLabel(c.ruleId)}
              </Pill>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

