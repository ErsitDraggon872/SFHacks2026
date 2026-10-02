/**
 * Engine-side guard for extractor output. Isomorphic + pure. OWNER: C1.
 * Whatever the LLM returns passes through here before draftToFacts()/evaluate().
 * Rule: anything doubtful becomes null (the engine then asks); we never guess a value.
 */
import { ROOMS } from "./data";
import type { Ambiguity, AvItem, EventDraft, FactField, Layout, RoomType, Tri } from "./types";

const AV_ITEMS: AvItem[] = ["projector", "display", "microphone", "speakers", "whiteboard", "video_conf", "computers", "piano"];
const AV_SYNONYMS: Record<string, AvItem> = {
  mic: "microphone",
  mics: "microphone",
  microphones: "microphone",
  screen: "display",
  tv: "display",
  monitor: "display",
  speaker: "speakers",
  zoom: "video_conf",
  computer: "computers",
};
const LAYOUTS: Layout[] = ["lecture", "classroom", "seminar", "open", "lab", "studio"];
const ROOM_TYPES: RoomType[] = ["lecture_hall", "classroom", "seminar", "multipurpose", "lab", "study_room", "studio"];
const FACT_FIELDS: FactField[] = [
  "summary", "headcount", "date", "startTime", "endTime", "food", "foodDescription", "amplifiedSound", "externalGuests",
  "guestSpeakers", "alcohol", "minors", "avNeeds", "layout", "preferredBuilding", "requestedRoomId", "adaRequired",
];
const TRI_FIELDS = ["food", "amplifiedSound", "externalGuests", "guestSpeakers", "alcohol", "minors"] as const;

export const MAX_HEADCOUNT = 2000;
const MAX_AMBIGUITIES = 5;

const BUILDINGS = [...new Map(ROOMS.map((r) => [r.building, r.buildingCode])).entries()].map(([name, code]) => ({ name, code }));
const BUILDING_ALIASES: Record<string, string> = {
  library: "LIB",
  "student center": "CCSC",
  "student centre": "CCSC",
  village: "VCS",
  centennial: "VCS",
  gym: "GYM",
  business: "BUS",
};

export const UNREADABLE_QUESTION = "We couldn't understand the request. What's the event, when, and for how many people?";

export function emptyDraft(): EventDraft {
  return {
    summary: null,
    headcount: null,
    whenPhrase: null,
    food: null,
    foodDescription: null,
    amplifiedSound: null,
    externalGuests: null,
    guestSpeakers: null,
    alcohol: null,
    minors: null,
    avNeeds: [],
    layout: null,
    roomTypeHints: [],
    preferredBuilding: null,
    missingRequiredFields: [],
    ambiguities: [],
  };
}

/** Map free text ("Thornton", "the library", "CCSC") to an exact Room.building, or null. */
export function matchBuilding(input: string): string | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const byCode = (code: string) => BUILDINGS.find((b) => b.code.toLowerCase() === code.toLowerCase())?.name ?? null;
  const exact = BUILDINGS.find((b) => b.name.toLowerCase() === q) ?? BUILDINGS.find((b) => b.code.toLowerCase() === q);
  if (exact) return exact.name;
  for (const [alias, code] of Object.entries(BUILDING_ALIASES)) if (q.includes(alias)) return byCode(code);
  const hits = BUILDINGS.filter((b) => b.name.toLowerCase().includes(q) || q.includes(b.name.toLowerCase()));
  return hits.length === 1 ? hits[0].name : null;
}

export function sanitizeDraft(raw: unknown): { draft: EventDraft; issues: string[] } {
  const issues: string[] = [];
  const draft = emptyDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    draft.ambiguities = [{ field: null, question: UNREADABLE_QUESTION }];
    return { draft, issues: ["draft is not an object"] };
  }
  const r = raw as Record<string, unknown>;
  const note = (field: string, why: string) => issues.push(`${field}: ${why}`);

  const str = (field: string, max: number): string | null => {
    const v = r[field];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return note(field, "not a string"), null;
    const t = v.trim();
    if (!t) return null;
    if (t.length > max) note(field, `truncated to ${max} chars`);
    return t.slice(0, max);
  };
  draft.summary = str("summary", 120);
  draft.foodDescription = str("foodDescription", 120);
  draft.whenPhrase = str("whenPhrase", 200);

  // headcount: a whole number in range, or unknown
  const hc = r.headcount;
  if (hc !== null && hc !== undefined) {
    const n = typeof hc === "number" ? hc : typeof hc === "string" && /^\s*\d+\s*$/.test(hc) ? Number(hc) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= MAX_HEADCOUNT) {
      draft.headcount = n;
      if (typeof hc === "string") note("headcount", "parsed from string");
    } else note("headcount", `invalid value ${JSON.stringify(hc)}`);
  }

  for (const field of TRI_FIELDS) draft[field] = tri(r[field], (why) => note(field, why));

  if (Array.isArray(r.avNeeds)) {
    const out = new Set<AvItem>();
    for (const item of r.avNeeds) {
      const key = typeof item === "string" ? item.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
      const av = (AV_ITEMS as string[]).includes(key) ? (key as AvItem) : AV_SYNONYMS[key.replace(/_/g, " ")] ?? AV_SYNONYMS[key];
      if (av) out.add(av);
      else note("avNeeds", `dropped ${JSON.stringify(item)}`);
    }
    draft.avNeeds = [...out];
  } else if (r.avNeeds !== null && r.avNeeds !== undefined) note("avNeeds", "not an array");

  draft.layout = (LAYOUTS as unknown[]).includes(r.layout) ? (r.layout as Layout) : null;
  if (r.layout != null && !draft.layout) note("layout", `dropped ${JSON.stringify(r.layout)}`);
  draft.roomTypeHints = Array.isArray(r.roomTypeHints) ? (r.roomTypeHints.filter((t) => (ROOM_TYPES as unknown[]).includes(t)) as RoomType[]) : [];

  const building = str("preferredBuilding", 120);
  if (building) {
    draft.preferredBuilding = matchBuilding(building);
    if (draft.preferredBuilding === null) note("preferredBuilding", `unknown building ${JSON.stringify(building)}`);
    else if (draft.preferredBuilding !== building) note("preferredBuilding", `"${building}" → "${draft.preferredBuilding}"`);
  }

  draft.missingRequiredFields = Array.isArray(r.missingRequiredFields)
    ? ([...new Set(r.missingRequiredFields.filter((f) => (FACT_FIELDS as unknown[]).includes(f)))] as FactField[])
    : [];

  if (Array.isArray(r.ambiguities)) {
    const out: Ambiguity[] = [];
    for (const a of r.ambiguities) {
      if (!a || typeof a !== "object") continue;
      const { field, question } = a as Record<string, unknown>;
      if (typeof question !== "string" || !question.trim()) continue;
      out.push({ field: (FACT_FIELDS as unknown[]).includes(field) ? (field as FactField) : null, question: question.trim().slice(0, 200) });
    }
    if (out.length > MAX_AMBIGUITIES) note("ambiguities", `kept first ${MAX_AMBIGUITIES} of ${out.length}`);
    draft.ambiguities = out.slice(0, MAX_AMBIGUITIES);
  }

  const known = new Set<string>(Object.keys(emptyDraft()));
  for (const k of Object.keys(r)) if (!known.has(k)) note(k, "unknown field dropped");

  return { draft, issues };
}

function tri(v: unknown, note: (why: string) => void): Tri {
  if (v === true || v === false || v === null || v === undefined) return v ?? null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes") return note("parsed from string"), true;
    if (s === "false" || s === "no") return note("parsed from string"), false;
  }
  note(`unclear value ${JSON.stringify(v)} → unknown`);
  return null;
}
