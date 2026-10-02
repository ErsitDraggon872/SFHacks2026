/**
 * Deterministic normalization: time phrases → dates, LLM draft → EventFacts with contextual defaults.
 * Isomorphic (runs in browser + server). OWNER: C1.
 */
import * as chrono from "chrono-node";
import {
  DEFAULT_ANCHOR_DATE,
  type IMPLIED_NO_FIELDS,
  type EventDraft,
  type EventFacts,
  type Fact,
  type FactField,
  type HHMM,
  type ISODate,
  type SafetyField,
  type UserCorrection,
} from "./types";

export const MAX_DURATION_MIN = 360;

export function anchorDate(): ISODate {
  return process.env.NEXT_PUBLIC_DEMO_ANCHOR_DATE || DEFAULT_ANCHOR_DATE;
}

export type ResolvedWhen = { date: ISODate; startTime: HHMM; endTime: HHMM; durationMin: number };
/** What's still missing, plus whatever the phrase did pin down ("October 10" → date, no times). */
export type WhenAmbiguity = { ambiguity: string; field: "date" | "startTime" | "endTime"; date?: ISODate; startTime?: HHMM };

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" that is also a real calendar date ("2026-02-30" is not). */
export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "HH:MM" 00:00–23:59; "24:00" only where end-of-day is legal (endTime). */
export function isHHMM(s: unknown, allowEndOfDay = false): s is HHMM {
  return typeof s === "string" && (/^([01]\d|2[0-3]):[0-5]\d$/.test(s) || (allowEndOfDay && s === "24:00"));
}

export function isHeadcount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

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
export function resolveWhen(phrase: string, anchor: ISODate = anchorDate()): ResolvedWhen | WhenAmbiguity {
  const cleaned = cleanWhen(phrase);
  if (!cleaned) return { ambiguity: "What day and time is the event?", field: "date" };
  const results = parseWhen(cleaned, anchor);
  const ordinal = cleaned.match(ORDINAL_DAY);
  if (!results.length && !ordinal) return { ambiguity: `We couldn't read "${phrase}". What day and time is the event?`, field: "date" };

  // chrono often splits one phrase ("Oct 24" + "at 6pm" + "9pm"): take the day and the times
  // from whichever matches carry them. Only a day the phrase names counts, never the anchor's.
  const named = results.find((r) => r.start.isCertain("day"));
  const weekday = results.find((r) => r.start.isCertain("weekday"));
  const date = named ? isoOf(named.start) : (ordinal && nextDayOfMonth(Number(ordinal[1]), anchor)) || (weekday ? isoOf(weekday.start) : undefined);
  if (!date) return { ambiguity: "What day is the event?", field: "date" };

  const times = results.flatMap((r) => [r.start, r.end]).filter((c): c is chrono.ParsedComponents => !!c?.isCertain("hour"));
  if (!times.length) return { ambiguity: `What time does the event start on ${fmtDay(date)}?`, field: "startTime", date };
  const forMin = durationOf(cleaned);
  let startMin = minutesOf(times[0]);
  const endMin = times[1] ? minutesOf(times[1]) : forMin !== null ? startMin + forMin : null;
  // "starts at 6 and ends at 9pm": a start with no am/pm takes the end's pm when that keeps it first
  if (endMin !== null && !times[0].isCertain("meridiem") && startMin < 720 && startMin + 720 < endMin) startMin += 720;
  const startTime = hhmm(startMin);
  if (endMin === null) return { ambiguity: "What time does the event end?", field: "endTime", date, startTime };

  const dur = endMin - startMin;
  if (endMin > 24 * 60) return { ambiguity: "Events must end by midnight. When does the event end?", field: "endTime", date };
  if (dur <= 0) return { ambiguity: "The end time is before the start time. When does the event end?", field: "endTime", date };
  if (dur > MAX_DURATION_MIN) return { ambiguity: "Events are limited to 6 hours. Can you shorten the time range?", field: "endTime", date };
  return { date, startTime, endTime: hhmm(endMin), durationMin: dur };
}

/**
 * The date/time phrase as written in free text ("on october 24 2026", "Thursday 6-9pm"), or null.
 * Only text that names a day counts: a bare number ("for 8 people") is never read as a time.
 * Times written apart from the day ("on October 24. It starts at 6pm and ends at 9pm") are kept.
 */
export function findWhenPhrase(text: string, anchor: ISODate = anchorDate()): string | null {
  const cleaned = cleanWhen(text);
  const results = parseWhen(cleaned, anchor);
  const ordinal = ORDINAL_DAY.exec(cleaned);
  const names = (r: chrono.ParsedResult) => r.start.isCertain("day") || r.start.isCertain("weekday");
  if (!ordinal && !results.some(names)) return null;
  const parts = results.filter((r) => names(r) || r.start.isCertain("hour")).map((r) => ({ at: r.index, text: r.text }));
  if (ordinal) parts.push({ at: ordinal.index, text: ordinal[0] });
  const dur = DURATION.exec(cleaned);
  if (dur) parts.push({ at: dur.index, text: dur[0] });
  return parts.sort((a, b) => a.at - b.at).map((p) => p.text).join(", ");
}

/** "the 24th" with no month: chrono skips it. */
const ORDINAL_DAY = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i;
const DURATION = /\bfor\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six)\s+(hours?|hrs?|minutes?|mins?)\b/i;
const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function cleanWhen(s: string) {
  // chrono reads "between 6 and 9pm" as just "9pm"
  return s.replace(/[–—]/g, "-").replace(/\bbetween\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+and\s+/gi, "from $1 to ").trim();
}

/** chrono matches, minus durations ("for 3 hours"), which it reads as a clock time. */
function parseWhen(cleaned: string, anchor: ISODate) {
  const ref = new Date(`${anchor}T09:00:00`);
  return chrono.parse(cleaned, ref, { forwardDate: true }).filter((r) => !/\b(hours?|hrs?|minutes?|mins?)\b/i.test(r.text));
}

function durationOf(s: string): number | null {
  const m = DURATION.exec(s);
  if (!m) return null;
  const n = WORD_NUM[m[1].toLowerCase()] ?? Number(m[1]);
  return Math.round(/^h/i.test(m[2]) ? n * 60 : n);
}

/** The next date on or after the anchor falling on this day of the month. */
function nextDayOfMonth(day: number, anchor: ISODate): ISODate | undefined {
  const [y, m, d] = anchor.split("-").map(Number);
  for (let i = day >= d ? 0 : 1; i < 3; i++) {
    const dt = new Date(y, m - 1 + i, day);
    if (dt.getDate() === day) return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(day)}`;
  }
  return undefined;
}

const isoOf = (c: chrono.ParsedComponents): ISODate => `${c.get("year")}-${pad(c.get("month")!)}-${pad(c.get("day")!)}`;
const minutesOf = (c: chrono.ParsedComponents) => c.get("hour")! * 60 + (c.get("minute") ?? 0);
const hhmm = (min: number): HHMM => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function fmtDay(date: ISODate) {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
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
    weapons: f<boolean | null>(null, "user"),
    avNeeds: f([], "user"),
    layout: f(null, "user"),
    preferredBuilding: f<string | null>(null, "user"),
    requestedRoomId: f<string | null>(null, "user"),
    adaRequired: f(false, "user"),
  };
}

/** Shared with the offline extractor. Broad on purpose: a false hit only asks the officer. */
export const WEAPON_CUE =
  /\b(guns?|firearms?|rifles?|pistols?|handguns?|shotguns?|weapons?|knife|knives|blades?|swords?|machetes?|tasers?|stun guns?|pepper spray|mace|ammo|ammunition|explosives?|airsoft|paintball|replicas?)\b/i;

const CUES = {
  food: /\b(food|pizza|snacks?|dinner|lunch|breakfast|brunch|cater(ing|ed)?|potluck|boba|coffee|donuts?|refreshments|bbq|tacos?)\b/i,
  externalGuests: /\b(public|open to (all|everyone)|community(?!\s+(room|center|centre))|alumni|recruiters?|guests?|visitors?|other schools|networking|mixer|career fair|families|parents)\b/i,
  // "speaker" means a loudspeaker here, not a guest speaker
  amplifiedSound: /\b(dj|music|(?<!guest )speakers?(?! from)|sound system|concert|performance|band|karaoke|party|dance)\b/i,
  guestSpeakers: /\b(guest speakers?|keynote|panel(ists?)?|speaker from|invited speaker|talk by)\b/i,
  // code-side backstops for the implied-"no" fields: a mention the AI didn't flag gets asked
  weapons: WEAPON_CUE,
  alcohol: /\b(alcohol(?:ic)?|beer|wine|cocktails?|liquor|booze|keg|bartender|byob|open bar|bar service|drinking)\b/i,
};

const SMALL_EVENT = 25;

/**
 * LLM draft → EventFacts. Applies contextual defaults (source "default") so small, plain
 * events can reach Tier 1 — the officer must attest to every defaulted value, except:
 *  - alcohol, weapons (IMPLIED_NO_FIELDS): false unless the AI says yes, never attested; a
 *    mention in the text the AI didn't flag stays null and gets asked.
 *  - minors: default false unless mentioned.
 *  - amplifiedSound, guestSpeakers: default false when no cue in the text.
 *  - food: default false only for small events (≤25) with no cue.
 *  - externalGuests: default false for small events, or any size when the text says "members",
 *    with no guest cue.
 * Never defaults a field the extractor raised a clarifying question about.
 */
export function draftToFacts(draft: EventDraft, opts: { text?: string; anchor?: ISODate } = {}): EventFacts {
  const text = `${opts.text ?? ""} ${draft.summary ?? ""} ${draft.foodDescription ?? ""}`;
  const when = draft.whenPhrase ? resolveWhen(draft.whenPhrase, opts.anchor) : null;
  // a partial phrase ("October 10") still fills in what it names; the rest stays null and gets asked
  const resolved: Partial<ResolvedWhen> | null = when;
  const small = draft.headcount !== null && draft.headcount <= SMALL_EVENT;

  // a field the extractor asked about is in doubt: ask the officer, never assume "no"
  const asked = new Set(draft.ambiguities.map((a) => a.field));
  const tri = (field: SafetyField, canDefault: boolean): Fact<boolean | null> => {
    const v = draft[field];
    return v !== null ? f(v, "ai") : canDefault && !asked.has(field) ? f(false, "default") : f(null, "ai");
  };
  // alcohol/weapons: "no" unless the AI says yes; AI questions about them are dropped (prepare())
  const impliedNo = (field: (typeof IMPLIED_NO_FIELDS)[number]): Fact<boolean | null> => {
    const v = draft[field];
    return v !== null ? f(v, "ai") : CUES[field].test(text) ? f(null, "ai") : f(false, "default");
  };

  return {
    summary: f(draft.summary),
    headcount: f(draft.headcount),
    date: f(resolved?.date ?? null),
    startTime: f(resolved?.startTime ?? null),
    endTime: f(resolved?.endTime ?? null),
    food: tri("food", small && !CUES.food.test(text)),
    foodDescription: f(draft.foodDescription),
    amplifiedSound: tri("amplifiedSound", !CUES.amplifiedSound.test(text)),
    externalGuests: tri("externalGuests", (small || /\bmembers\b/i.test(text)) && !CUES.externalGuests.test(text)),
    guestSpeakers: tri("guestSpeakers", !CUES.guestSpeakers.test(text)),
    alcohol: impliedNo("alcohol"),
    minors: tri("minors", true),
    weapons: impliedNo("weapons"),
    avNeeds: f(draft.avNeeds),
    layout: f(draft.layout),
    preferredBuilding: f(draft.preferredBuilding),
    requestedRoomId: f<string | null>(null),
    adaRequired: f(false),
  };
}

/** Ambiguity from the time phrase, if any (merged into clarifying questions by the API). */
export function whenAmbiguity(draft: EventDraft, anchor?: ISODate): Pick<WhenAmbiguity, "ambiguity" | "field"> | null {
  if (!draft.whenPhrase) return null;
  const r = resolveWhen(draft.whenPhrase, anchor);
  return "ambiguity" in r ? { ambiguity: r.ambiguity, field: r.field } : null;
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
