/**
 * Explainable, lexicographic room ranking. Never decides eligibility or tier — it only orders
 * rooms using the PolicyDecision. Isomorphic. OWNER: C1.
 *
 * Order: (1) eligible  (2) seats everyone  (3) has all requested AV  (4) layout match
 *        (5) smallest adequate room  (6) preferences (building, ADA)
 */
import type { AvItem, EventFacts, PolicyDecision, RankReason, RankedRoom, Room } from "./types";

const AV_LABEL: Record<AvItem, string> = {
  projector: "projector",
  display: "display screen",
  microphone: "microphone",
  speakers: "speakers",
  whiteboard: "whiteboard",
  video_conf: "video conferencing",
  computers: "computers",
  piano: "piano",
};
export const avLabel = (a: AvItem) => AV_LABEL[a];

export function avMissing(room: Room, facts: EventFacts): AvItem[] {
  return facts.avNeeds.value.filter((a) => !room.av.includes(a));
}

/**
 * Fit comparator ignoring policy eligibility (used by policy.ts to pick the "intended" room
 * in a preferred building, and as the tie-breaker chain here). Negative = a is better.
 */
export function compareFit(a: Room, b: Room, facts: EventFacts): number {
  const n = facts.headcount.value ?? 0;
  const keys = (r: Room): number[] => [
    r.seats >= n ? 0 : 1,
    avMissing(r, facts).length,
    facts.layout.value && r.layout !== facts.layout.value ? 1 : 0,
    r.seats >= n ? r.seats : 10_000 - r.seats, // smallest adequate first; if none adequate, biggest first
    facts.preferredBuilding.value && r.building !== facts.preferredBuilding.value ? 1 : 0,
    facts.adaRequired.value && !r.adaAccessible ? 1 : 0,
  ];
  const ka = keys(a);
  const kb = keys(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return a.id.localeCompare(b.id);
}

function reasonsFor(room: Room, facts: EventFacts): RankReason[] {
  const n = facts.headcount.value;
  const out: RankReason[] = [];
  if (n !== null) {
    out.push(
      room.seats >= n
        ? { label: `Seats ${room.seats} for your ${n}`, kind: "fit" }
        : { label: `Only ${room.seats} seats for ${n}`, kind: "miss" },
    );
  }
  if (facts.food.value === true && room.foodAllowed) out.push({ label: "Food permitted", kind: "fit" });
  const missing = avMissing(room, facts);
  for (const a of facts.avNeeds.value) {
    if (!missing.includes(a)) out.push({ label: cap(AV_LABEL[a]), kind: "fit" });
  }
  for (const a of missing) out.push({ label: `No ${AV_LABEL[a]}`, kind: "miss" });
  if (facts.amplifiedSound.value === true && room.soundIsolated) out.push({ label: "Sound-isolated", kind: "fit" });
  if (facts.layout.value) {
    out.push(
      room.layout === facts.layout.value
        ? { label: `${cap(room.layout)} layout`, kind: "fit" }
        : { label: `${cap(room.layout)} layout`, kind: "miss" },
    );
  }
  if (facts.preferredBuilding.value && room.building === facts.preferredBuilding.value) {
    out.push({ label: `In ${room.building}`, kind: "pref" });
  }
  if (room.adaAccessible) out.push({ label: "Accessible", kind: "pref" });
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function rankRooms(facts: EventFacts, decision: PolicyDecision, rooms: Room[]): RankedRoom[] {
  const evalById = new Map(decision.rooms.map((e) => [e.roomId, e]));
  const sorted = [...rooms].sort((a, b) => {
    const ea = evalById.get(a.id)?.eligible ? 0 : 1;
    const eb = evalById.get(b.id)?.eligible ? 0 : 1;
    return ea - eb || compareFit(a, b, facts);
  });
  let rank = 0;
  return sorted.map((room) => {
    const evaluation = evalById.get(room.id) ?? { roomId: room.id, eligible: false, conflicts: [], warnings: [] };
    const reasons = reasonsFor(room, facts);
    const why = evaluation.eligible
      ? reasons.filter((r) => r.kind !== "miss").map((r) => r.label).slice(0, 4).join(" · ")
      : evaluation.conflicts.map((c) => c.message).join(" · ");
    return {
      room,
      evaluation,
      rank: evaluation.eligible ? ++rank : null,
      reasons,
      avMissing: avMissing(room, facts),
      why,
    };
  });
}
