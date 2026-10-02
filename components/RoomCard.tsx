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
import { Placeholder } from "@/components/ui";
import type { RankedRoom } from "@/lib/types";

export type RoomCardVariant = "best" | "row" | "unavailable";

export interface RoomCardProps {
  ranked: RankedRoom;
  variant: RoomCardVariant;
  isTarget: boolean;
  onSelect: (roomId: string) => void;
}

export function RoomCard({ ranked, variant, isTarget, onSelect }: RoomCardProps) {
  return (
    <Placeholder name={`RoomCard variant="${variant}"`}>
      #{ranked.rank ?? "–"} {ranked.room.name} · {ranked.why} {isTarget && "· selected"}{" "}
      {variant !== "unavailable" && !isTarget && (
        <button className="underline" onClick={() => onSelect(ranked.room.id)}>
          choose
        </button>
      )}
    </Placeholder>
  );
}
