/**
 * Deterministic normalization: time phrases → dates, LLM draft → EventFacts with contextual defaults.
 * Isomorphic (runs in browser + server). OWNER: C1.
 */
import * as chrono from "chrono-node";
import {
  DEFAULT_ANCHOR_DATE,
  type EventDraft,
  type EventFacts,
  type Fact,
  type FactField,
  type HHMM,
  type ISODate,
  type UserCorrection,
} from "./types";

export const MAX_DURATION_MIN = 360;

export function anchorDate(): ISODate {
  return process.env.NEXT_PUBLIC_DEMO_ANCHOR_DATE || DEFAULT_ANCHOR_DATE;
}

export type ResolvedWhen = { date: ISODate; startTime: HHMM; endTime: HHMM; durationMin: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function toMinutes(t: HHMM): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function durationMin(start: HHMM | null, end: HHMM | null): number | null {
  if (!start || !end) return null;
  return toMinutes(end) - toMinutes(start);
}

/**
 * Resolve a raw phrase like "Thursday 6–9pm" against the demo anchor (a Monday).
 * Never guesses: anything uncertain comes back as an ambiguity question.
 */
export function resolveWhen(phrase: string, anchor: ISODate = anchorDate()): ResolvedWhen | { ambiguity: string } {
  const cleaned = phrase.replace(/[–—]/g, "-").trim();
  if (!cleaned) return { ambiguity: "What day and time is the event?" };
  const ref = new Date(`${anchor}T09:00:00`);
  const result = chrono.parse(cleaned, ref, { forwardDate: true })[0];
  if (!result) return { ambiguity: `We couldn't read "${phrase}". What day and time is the event?` };

  const s = result.start;
  if (!s.isCertain("hour")) return { ambiguity: `What time does the event start on ${fmtDay(s)}?` };
  if (!result.end || !result.end.isCertain("hour")) return { ambiguity: "What time does the event end?" };

  const e = result.end;
  const date = `${s.get("year")}-${pad(s.get("month")!)}-${pad(s.get("day")!)}`;
  const startTime = `${pad(s.get("hour")!)}:${pad(s.get("minute") ?? 0)}`;
  const endTime = `${pad(e.get("hour")!)}:${pad(e.get("minute") ?? 0)}`;
  const dur = toMinutes(endTime) - toMinutes(startTime);
  if (dur <= 0) return { ambiguity: "The end time is before the start time. When does the event end?" };
  if (dur > MAX_DURATION_MIN) return { ambiguity: "Events are limited to 6 hours. Can you shorten the time range?" };
  return { date, startTime, endTime, durationMin: dur };
}

function fmtDay(s: chrono.ParsedComponents) {
  return `${s.get("month")}/${s.get("day")}`;
}

// ---------- facts helpers ----------

const f = <T,>(value: T, source: Fact<T>["source"] = "ai"): Fact<T> => ({ value, source });

/** Blank facts, everything user-sourced (used by Quick Filters). */
export function emptyFacts(): EventFacts {
  return {
    summary: f<string | null>(null, "user"),
    headcount: f<number | null>(null, "user"),
    date: f<ISODate | null>(null, "user"),
    startTime: f<HHMM | null>(null, "user"),
    endTime: f<HHMM | null>(null, "user"),
    food: f<boolean | null>(null, "user"),
    foodDescription: f<string | null>(null, "user"),
    amplifiedSound: f<boolean | null>(null, "user"),
    externalGuests: f<boolean | null>(null, "user"),
    guestSpeakers: f<boolean | null>(null, "user"),
    alcohol: f<boolean | null>(null, "user"),
    minors: f<boolean | null>(null, "user"),
    avNeeds: f([], "user"),
    layout: f(null, "user"),
    preferredBuilding: f<string | null>(null, "user"),
    requestedRoomId: f<string | null>(null, "user"),
    adaRequired: f(false, "user"),
  };
}

const CUES = {
  food: /\b(food|pizza|snacks?|dinner|lunch|breakfast|brunch|cater(ing|ed)?|potluck|boba|coffee|donuts?|refreshments|bbq|tacos?)\b/i,
  externalGuests: /\b(public|open to (all|everyone)|community|alumni|recruiters?|guests?|visitors?|other schools|networking|mixer|career fair|families|parents)\b/i,
  // "speaker" means a loudspeaker here, not a guest speaker
  amplifiedSound: /\b(dj|music|(?<!guest )speakers?(?! from)|sound system|concert|performance|band|karaoke|party|dance)\b/i,
  guestSpeakers: /\b(guest speakers?|keynote|panel(ists?)?|speaker from|invited speaker|talk by)\b/i,
};

const SMALL_EVENT = 25;

/**
 * LLM draft → EventFacts. Applies contextual defaults (source "default") so small, plain
 * events can reach Tier 1 — the officer must attest to every defaulted value.
 *  - alcohol, minors: default false unless mentioned.
 *  - amplifiedSound, guestSpeakers: default false when no cue in the text.
 *  - food, externalGuests: default false only for small events (≤25) with no cue.
 */
export function draftToFacts(draft: EventDraft, opts: { text?: string; anchor?: ISODate } = {}): EventFacts {
  const text = `${opts.text ?? ""} ${draft.summary ?? ""} ${draft.foodDescription ?? ""}`;
  const when = draft.whenPhrase ? resolveWhen(draft.whenPhrase, opts.anchor) : null;
  const resolved = when && !("ambiguity" in when) ? when : null;
  const small = draft.headcount !== null && draft.headcount <= SMALL_EVENT;

  const tri = (v: boolean | null, canDefault: boolean): Fact<boolean | null> =>
    v !== null ? f(v, "ai") : canDefault ? f(false, "default") : f(null, "ai");

  return {
    summary: f(draft.summary),
    headcount: f(draft.headcount),
    date: f(resolved?.date ?? null),
    startTime: f(resolved?.startTime ?? null),
    endTime: f(resolved?.endTime ?? null),
    food: tri(draft.food, small && !CUES.food.test(text)),
    foodDescription: f(draft.foodDescription),
    amplifiedSound: tri(draft.amplifiedSound, !CUES.amplifiedSound.test(text)),
    externalGuests: tri(draft.externalGuests, small && !CUES.externalGuests.test(text)),
    guestSpeakers: tri(draft.guestSpeakers, !CUES.guestSpeakers.test(text)),
    alcohol: tri(draft.alcohol, true),
    minors: tri(draft.minors, true),
    avNeeds: f(draft.avNeeds),
    layout: f(draft.layout),
    preferredBuilding: f(draft.preferredBuilding),
    requestedRoomId: f<string | null>(null),
    adaRequired: f(false),
  };
}

/** Ambiguity from the time phrase, if any (merged into clarifying questions by the API). */
export function whenAmbiguity(draft: EventDraft, anchor?: ISODate): string | null {
  if (!draft.whenPhrase) return null;
  const r = resolveWhen(draft.whenPhrase, anchor);
  return "ambiguity" in r ? r.ambiguity : null;
}

/** Return a copy of facts with one field set by the user. */
export function setFact<K extends FactField>(facts: EventFacts, field: K, value: EventFacts[K]["value"]): EventFacts {
  return { ...facts, [field]: { value, source: "user" } };
}

/** Diff the AI/default facts against the current facts → audit trail of user corrections. */
export function diffCorrections(original: EventFacts, current: EventFacts): UserCorrection[] {
  const out: UserCorrection[] = [];
  for (const key of Object.keys(current) as FactField[]) {
    if (current[key].source !== "user") continue;
    const before = original[key]?.value;
    const after = current[key].value;
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ field: key, aiValue: before, userValue: after });
  }
  return out;
}
