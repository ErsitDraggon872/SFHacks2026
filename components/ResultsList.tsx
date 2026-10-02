"use client";
/**
 * ResultsList — OWNER: C1. Layout of the ranked rooms: #1 large, #2–#5 compact rows,
 * the rest of the eligible rooms behind "Show more", ineligible rooms folded into a disclosure.
 * Each item is a RoomCard (C2).
 */
import { RoomCard } from "@/components/RoomCard";
import { Disclosure, SectionLabel } from "@/components/ui";
import type { RankedRoom } from "@/lib/types";

export function ResultsList({
  ranked,
  targetRoomId,
  onSelect,
}: {
  ranked: RankedRoom[];
  targetRoomId: string | null;
  onSelect: (roomId: string) => void;
}) {
  const eligible = ranked.filter((r) => r.rank !== null);
  const unavailable = ranked.filter((r) => r.rank === null);
  const [best, ...rest] = eligible;
  const rows = rest.slice(0, 4);
  const more = rest.slice(4);

  return (
    <section aria-label="Ranked rooms" className="space-y-3">
      <SectionLabel>{eligible.length ? `${eligible.length} rooms fit` : "No rooms fit"}</SectionLabel>
      {best && <RoomCard ranked={best} variant="best" isTarget={best.room.id === targetRoomId} onSelect={onSelect} />}
      {rows.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {rows.map((r) => (
            <li key={r.room.id}>
              <RoomCard ranked={r} variant="row" isTarget={r.room.id === targetRoomId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
      {more.length > 0 && (
        <Disclosure summary={`Show ${more.length} more`}>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {more.map((r) => (
              <li key={r.room.id}>
                <RoomCard ranked={r} variant="row" isTarget={r.room.id === targetRoomId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {unavailable.length > 0 && (
        <Disclosure summary={`${unavailable.length} rooms unavailable — show why`}>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-subtle">
            {unavailable.map((r) => (
              <li key={r.room.id}>
                <RoomCard ranked={r} variant="unavailable" isTarget={r.room.id === targetRoomId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}
