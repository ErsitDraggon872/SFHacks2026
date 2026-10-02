/**
 * Deterministic policy engine — the ONLY place tier / approval is decided.
 * Pure + isomorphic: the client re-runs it instantly after chip edits; the server re-runs it at booking.
 * OWNER: C1.
 */
import { CLUB_BY_ID, getRule } from "./data";
import { durationMin, toMinutes } from "./normalize";
import { compareFit } from "./rank";
import {
  DAILY_CAP_MIN,
  REQUIRED_FIELDS,
  SAFETY_FIELDS,
  type Booking,
  type EvaluateContext,
  type EventFacts,
  type FactField,
  type PermitRequirement,
  type PolicyDecision,
  type PolicyFlag,
  type PolicyRuleResult,
  type Room,
  type RoomEvaluation,
  type Unresolved,
} from "./types";

const ACTIVE: Booking["status"][] = ["confirmed", "pending_permit", "pending_review"];

export const QUESTIONS: Record<FactField, string> = {
  summary: "What is the event?",
  headcount: "How many people do you expect?",
  date: "What day is the event?",
  startTime: "What time does the event start?",
  endTime: "What time does the event end?",
  food: "Will food or drinks (other than water) be served?",
  foodDescription: "What food will be served?",
  amplifiedSound: "Will there be amplified sound (speakers, DJ, microphones)?",
  externalGuests: "Will anyone attending be unaffiliated with SFSU?",
  guestSpeakers: "Will there be a guest speaker?",
  alcohol: "Will alcohol be present?",
  minors: "Will anyone under 18 attend?",
  avNeeds: "What equipment do you need?",
  layout: "What room layout do you need?",
  preferredBuilding: "Do you have a preferred building?",
  requestedRoomId: "Which room would you like?",
  adaRequired: "Does anyone need an accessible space?",
};

const flag = (ruleId: string, message: string, roomId?: string): PolicyFlag => {
  const r = getRule(ruleId);
  return { ruleId, effect: r.effect, scope: r.scope, message, ...(roomId ? { roomId } : {}) };
};

function overlaps(b: Booking, date: string, start: string, end: string) {
  return b.date === date && toMinutes(b.startTime) < toMinutes(end) && toMinutes(start) < toMinutes(b.endTime);
}

/** Room-scope checks only (compatibility of this event with this room). */
export function evaluateRoom(room: Room, facts: EventFacts, bookings: Booking[]): RoomEvaluation {
  const n = facts.headcount.value;
  const date = facts.date.value;
  const start = facts.startTime.value;
  const end = facts.endTime.value;
  const sound = facts.amplifiedSound.value === true;
  const conflicts: PolicyFlag[] = [];

  if (n !== null && n > room.fireCapacity) {
    conflicts.push(flag("CAP-01", `${n} attendees exceeds the ${room.fireCapacity}-person fire capacity of ${room.name}`, room.id));
  }
  if (facts.food.value === true && !room.foodAllowed) {
    conflicts.push(flag("FOOD-01", `Food isn't allowed in ${room.name}`, room.id));
  }
  if (sound && end && toMinutes(end) > toMinutes("21:00") && !room.soundIsolated) {
    conflicts.push(flag("SOUND-01", `Amplified sound after 9 PM needs a sound-isolated room`, room.id));
  }
  if (sound && end && room.nearResidence && toMinutes(end) > toMinutes("20:00")) {
    conflicts.push(flag("SOUND-02", `${room.name} is in a residential area — no amplified sound after 8 PM`, room.id));
  }
  if (start && end && (toMinutes(start) < toMinutes(room.hours.open) || toMinutes(end) > toMinutes(room.hours.close))) {
    conflicts.push(flag("HOURS-01", `${room.building} is open ${room.hours.open}–${room.hours.close}`, room.id));
  }
  if (date && start && end) {
    const clash = bookings.find((b) => b.roomId === room.id && ACTIVE.includes(b.status) && overlaps(b, date, start, end));
    if (clash) conflicts.push(flag("BOOK-01", `Already booked ${clash.startTime}–${clash.endTime}`, room.id));
  }
  if (facts.adaRequired.value && !room.adaAccessible) {
    conflicts.push(flag("ADA-01", `${room.name} doesn't have accessible seating`, room.id));
  }
  return { roomId: room.id, eligible: conflicts.length === 0, conflicts, warnings: [] };
}

function clubMinutes(bookings: Booking[], clubId: string, date: string | null) {
  if (!date) return 0;
  return bookings
    .filter((b) => b.clubId === clubId && b.date === date && ACTIVE.includes(b.status))
    .reduce((sum, b) => sum + b.durationMin, 0);
}

function pickTarget(facts: EventFacts, rooms: Room[], evals: Map<string, RoomEvaluation>): Room | null {
  const requested = facts.requestedRoomId.value && rooms.find((r) => r.id === facts.requestedRoomId.value);
  if (requested) return requested;
  const building = facts.preferredBuilding.value;
  if (building) {
    const inBuilding = rooms.filter((r) => r.building === building).sort((a, b) => compareFit(a, b, facts));
    if (inBuilding.length) {
      // the officer asked for this building: target its best-fitting room even if it has conflicts
      return inBuilding.find((r) => evals.get(r.id)?.eligible) ?? inBuilding[0];
    }
  }
  const eligible = rooms.filter((r) => evals.get(r.id)?.eligible).sort((a, b) => compareFit(a, b, facts));
  return eligible[0] ?? null;
}

function permitsFor(facts: EventFacts, room: Room | null, clubId: string): PermitRequirement[] {
  const club = CLUB_BY_ID[clubId]?.name ?? clubId;
  const when = facts.date.value ? `${facts.date.value} · ${facts.startTime.value ?? "?"}–${facts.endTime.value ?? "?"}` : "To be confirmed";
  const base = [
    { label: "Event", value: facts.summary.value ?? "Student organization event" },
    { label: "Organization", value: club },
    { label: "Date & time", value: when },
    { label: "Location", value: room?.name ?? "To be assigned" },
    { label: "Expected attendance", value: facts.headcount.value?.toString() ?? "To be confirmed" },
  ];
  const out: PermitRequirement[] = [];
  if (facts.food.value === true) {
    out.push({
      permitId: "EHS_TEMP_FOOD",
      ruleId: "FOOD-02",
      name: "Temporary Food Permit",
      office: getRule("FOOD-02").office!,
      fields: [
        ...base,
        { label: "Food served", value: facts.foodDescription.value ?? "To be described" },
        { label: "Food source", value: "Licensed vendor (to be confirmed by organizer)" },
      ],
    });
  }
  if (facts.guestSpeakers.value === true) {
    out.push({
      permitId: "GUEST_SPEAKER",
      ruleId: "GUEST-02",
      name: "Guest Speaker Registration",
      office: getRule("GUEST-02").office!,
      fields: [...base, { label: "Speaker(s)", value: "To be provided by organizer" }],
    });
  }
  return out;
}

const RESULT_STATUS = { BLOCK_ROOM: "block", BLOCK_REQUEST: "block", REQUIRE_PERMIT: "permit", WARN: "warn", ESCALATE: "escalate" } as const;

export function evaluate(facts: EventFacts, ctx: EvaluateContext): PolicyDecision {
  const { rooms, bookings, clubId, attested } = ctx;
  const n = facts.headcount.value;
  const date = facts.date.value;
  const reqMin = durationMin(facts.startTime.value, facts.endTime.value);

  // ---- unresolved fields (unknown ≠ no) ----
  const unresolved: Unresolved[] = [];
  for (const field of [...REQUIRED_FIELDS, ...SAFETY_FIELDS]) {
    if (facts[field].value === null) unresolved.push({ field, question: QUESTIONS[field] });
  }
  if (reqMin !== null && reqMin <= 0) unresolved.push({ field: "endTime", question: "The end time is before the start time. When does it end?" });
  const defaultsToAttest = SAFETY_FIELDS.filter((k) => facts[k].source === "default");

  // ---- event-scope flags ----
  const eventFlags: PolicyFlag[] = [];
  const hardBlocks: PolicyFlag[] = [];
  if (facts.food.value === true) eventFlags.push(flag("FOOD-02", "Serving food requires a Temporary Food Permit"));
  if (facts.guestSpeakers.value === true) eventFlags.push(flag("GUEST-02", "Guest speakers must be registered"));
  if (facts.externalGuests.value === true) eventFlags.push(flag("GUEST-01", "Non-SFSU guests require a campus safety review"));
  if (n !== null && n > 100) eventFlags.push(flag("SIZE-02", `${n} attendees requires large-event review`));
  else if (n !== null && n > 50) eventFlags.push(flag("SIZE-01", `${n} attendees — designate an on-site event lead`));
  if (facts.alcohol.value === true) eventFlags.push(flag("ALC-01", "Alcohol requires prior written approval"));
  if (facts.minors.value === true) eventFlags.push(flag("MINOR-01", "Participants under 18 require youth-protection review"));
  if (unresolved.length) eventFlags.push(flag("INFO-01", `${unresolved.length} detail${unresolved.length > 1 ? "s" : ""} still need an answer`));

  const used = clubMinutes(bookings, clubId, date);
  if (reqMin !== null && reqMin > 0 && used + reqMin > DAILY_CAP_MIN) {
    hardBlocks.push(
      flag("CAP-DAILY-01", `This would bring your organization to ${fmtHrs(used + reqMin)} on ${date} (limit ${fmtHrs(DAILY_CAP_MIN)})`),
    );
  }

  // ---- room-scope compatibility ----
  const roomEvals = rooms.map((r) => evaluateRoom(r, facts, bookings));
  const evalById = new Map(roomEvals.map((e) => [e.roomId, e]));
  const target = pickTarget(facts, rooms, evalById);
  const targetEval = target ? evalById.get(target.id)! : null;
  const anyEligible = roomEvals.some((e) => e.eligible);
  const suggested =
    targetEval && !targetEval.eligible
      ? rooms.filter((r) => evalById.get(r.id)!.eligible).sort((a, b) => compareFit(a, b, facts))[0] ?? null
      : null;

  const permitsRequired = permitsFor(facts, target && targetEval?.eligible ? target : suggested ?? target, clubId);
  const escalations = eventFlags.filter((f) => f.effect === "ESCALATE");

  // ---- tier: escalate → 3; anything needing a change/permit/answer → 2; else 1 ----
  let tier: 1 | 2 | 3;
  if (escalations.length || (n !== null && !anyEligible)) tier = 3;
  else if (hardBlocks.length || !targetEval?.eligible || permitsRequired.length || unresolved.length) tier = 2;
  else tier = 1;

  const canSubmit =
    !!targetEval?.eligible && hardBlocks.length === 0 && unresolved.length === 0 && (defaultsToAttest.length === 0 || attested);
  const submitOutcome = !canSubmit
    ? null
    : tier === 3
      ? "pending_review"
      : permitsRequired.length
        ? "pending_permit"
        : "confirmed";

  // ---- checklist for the target room ----
  const applicableRules = checklist(facts, target, targetEval, eventFlags, hardBlocks, used, reqMin);

  return {
    tier,
    canAutoApprove: tier === 1 && canSubmit,
    needsInfo: unresolved.length > 0,
    eventFlags,
    hardBlocks,
    rooms: roomEvals,
    targetRoomId: target?.id ?? null,
    suggestedRoomId: suggested?.id ?? null,
    permitsRequired,
    applicableRules,
    unresolved,
    defaultsToAttest,
    clubMinutesUsed: used,
    clubMinutesCap: DAILY_CAP_MIN,
    requestMinutes: reqMin,
    canSubmit,
    submitOutcome,
    headline: headline(tier, target, targetEval, suggested, escalations, hardBlocks, permitsRequired, unresolved, n, anyEligible),
  };
}

function checklist(
  facts: EventFacts,
  target: Room | null,
  targetEval: RoomEvaluation | null,
  eventFlags: PolicyFlag[],
  hardBlocks: PolicyFlag[],
  used: number,
  reqMin: number | null,
): PolicyRuleResult[] {
  const out: PolicyRuleResult[] = [];
  const push = (ruleId: string, status: PolicyRuleResult["status"], detail: string) =>
    out.push({ ruleId, title: getRule(ruleId).title, status, detail });
  const conflict = (id: string) => targetEval?.conflicts.find((c) => c.ruleId === id);
  const n = facts.headcount.value;

  if (target) {
    const c = conflict("CAP-01");
    if (n === null) push("CAP-01", "info", `Headcount not confirmed (fire capacity ${target.fireCapacity})`);
    else push("CAP-01", c ? "block" : "pass", c ? c.message : `${n} attendees ≤ ${target.fireCapacity} fire capacity`);

    if (facts.food.value !== false) {
      const fc = conflict("FOOD-01");
      if (facts.food.value === null) push("FOOD-01", "info", "Food not confirmed");
      else push("FOOD-01", fc ? "block" : "pass", fc ? fc.message : `Food permitted in ${target.name}`);
    }
    if (facts.amplifiedSound.value === true) {
      for (const id of ["SOUND-01", "SOUND-02"]) {
        const sc = conflict(id);
        if (sc) push(id, "block", sc.message);
      }
      if (!conflict("SOUND-01") && !conflict("SOUND-02")) push("SOUND-01", "pass", "Amplified sound allowed at this time and place");
    }
    const hc = conflict("HOURS-01");
    push("HOURS-01", hc ? "block" : "pass", hc ? hc.message : `Within ${target.building} hours (${target.hours.open}–${target.hours.close})`);
    const bc = conflict("BOOK-01");
    if (facts.date.value) push("BOOK-01", bc ? "block" : "pass", bc ? bc.message : "Room is free at this time");
    const ac = conflict("ADA-01");
    if (facts.adaRequired.value) push("ADA-01", ac ? "block" : "pass", ac ? ac.message : "Accessible seating available");
  }
  for (const f of eventFlags) push(f.ruleId, RESULT_STATUS[f.effect], f.message);
  const cap = hardBlocks.find((h) => h.ruleId === "CAP-DAILY-01");
  if (cap) push("CAP-DAILY-01", "block", cap.message);
  else if (reqMin !== null && reqMin > 0) push("CAP-DAILY-01", "pass", `${fmtHrs(used + reqMin)} of ${fmtHrs(DAILY_CAP_MIN)} daily limit`);
  return out;
}

function headline(
  tier: 1 | 2 | 3,
  target: Room | null,
  targetEval: RoomEvaluation | null,
  suggested: Room | null,
  escalations: PolicyFlag[],
  hardBlocks: PolicyFlag[],
  permits: PermitRequirement[],
  unresolved: Unresolved[],
  n: number | null,
  anyEligible: boolean,
): string {
  if (tier === 3) {
    if (!escalations.length && n !== null && !anyEligible) return `Staff review required: no room fits ${n} people at this time`;
    return `Staff review required: ${escalations.map((e) => e.message.charAt(0).toLowerCase() + e.message.slice(1)).join("; ")}`;
  }
  if (hardBlocks.length) return hardBlocks[0].message;
  if (unresolved.length) return `${unresolved.length} quick question${unresolved.length > 1 ? "s" : ""} before we can book`;
  if (targetEval && !targetEval.eligible) {
    const why = targetEval.conflicts[0]?.message ?? "This room isn't available";
    return suggested ? `Needs one change: ${lowerFirst(why)}` : why;
  }
  if (permits.length) return `Ready to book: ${permits.map((p) => p.name).join(" and ")} will be filed for you`;
  return target ? `Ready to book ${target.name}` : "No matching room";
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function fmtHrs(min: number) {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}
