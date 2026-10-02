/**
 * GatorSpace shared contract. OWNER: Computer 1.
 * Frozen at T+15m — announce any change to the team before pushing.
 *
 * Pipeline:
 *   text → [LLM extractor] → EventDraft → draftToFacts() → EventFacts (+ user corrections)
 *        → evaluate() → PolicyDecision → rankRooms() → RankedRoom[]
 *        → (tier 2/3) [LLM writer] → WriterOutput → DecisionSnapshot
 *
 * Rule: only lib/policy.ts decides tier / approval. Everything else renders or explains it.
 */

// ---------- primitives ----------

/** Tri-state: null means UNKNOWN, never "no". */
export type Tri = boolean | null;

/** Where a fact's value came from. */
export type FactSource = "ai" | "user" | "default";

export interface Fact<T> {
  value: T;
  source: FactSource;
}

export type AvItem =
  | "projector"
  | "display"
  | "microphone"
  | "speakers"
  | "whiteboard"
  | "video_conf"
  | "computers"
  | "piano";

export type Layout = "lecture" | "classroom" | "seminar" | "open" | "lab" | "studio";

export type RoomType = "lecture_hall" | "classroom" | "seminar" | "multipurpose" | "lab" | "study_room" | "studio";

/** "YYYY-MM-DD" in America/Los_Angeles. */
export type ISODate = string;
/** "HH:mm" 24h, America/Los_Angeles. */
export type HHMM = string;

// ---------- reference data ----------

export interface Room {
  id: string; // e.g. "TH-326"
  name: string; // "Thornton Hall 326"
  building: string; // "Thornton Hall"
  buildingCode: string; // "TH"
  type: RoomType;
  layout: Layout;
  seats: number;
  fireCapacity: number;
  av: AvItem[];
  foodAllowed: boolean;
  nearResidence: boolean;
  soundIsolated: boolean;
  adaAccessible: boolean;
  hours: { open: HHMM; close: HHMM };
  notes?: string;
}

export interface Club {
  id: string;
  name: string;
  short: string;
}

export type PolicyEffect = "BLOCK_ROOM" | "BLOCK_REQUEST" | "REQUIRE_PERMIT" | "WARN" | "ESCALATE";
export type PolicyScope = "event" | "room";

/** Metadata in data/policy.json. Condition logic lives in lib/policy.ts keyed by id. */
export interface PolicyRule {
  id: string; // "FOOD-01"
  title: string;
  excerpt: string; // illustrative policy text shown when a citation is clicked
  effect: PolicyEffect;
  scope: PolicyScope;
  office?: string; // owning office, e.g. "Environmental Health & Safety"
}

// ---------- extraction ----------

/** Every field a user can see/correct. */
export interface EventFacts {
  summary: Fact<string | null>;
  headcount: Fact<number | null>;
  date: Fact<ISODate | null>;
  startTime: Fact<HHMM | null>;
  endTime: Fact<HHMM | null>;
  food: Fact<Tri>;
  foodDescription: Fact<string | null>;
  amplifiedSound: Fact<Tri>;
  externalGuests: Fact<Tri>;
  guestSpeakers: Fact<Tri>;
  alcohol: Fact<Tri>;
  minors: Fact<Tri>;
  avNeeds: Fact<AvItem[]>;
  layout: Fact<Layout | null>;
  preferredBuilding: Fact<string | null>; // building name, e.g. "Thornton Hall"
  requestedRoomId: Fact<string | null>; // set by user or by "Fix It"
  adaRequired: Fact<boolean>;
}

export type FactField = keyof EventFacts;

/** Policy-sensitive fields: null blocks auto-approval. */
export const SAFETY_FIELDS = ["food", "amplifiedSound", "externalGuests", "guestSpeakers", "alcohol", "minors"] as const;
export type SafetyField = (typeof SAFETY_FIELDS)[number];

/** Fields required before any decision can be made. */
export const REQUIRED_FIELDS = ["headcount", "date", "startTime", "endTime"] as const;

export interface Ambiguity {
  field: FactField | null;
  question: string; // shown to the officer, e.g. "Will anyone attending be unaffiliated with SFSU?"
}

/** Raw LLM extractor output (no sources; null = not stated). */
export interface EventDraft {
  summary: string | null;
  headcount: number | null;
  /** The raw time phrase as written, e.g. "Thursday 6–9pm". Resolved in code by normalize.ts. */
  whenPhrase: string | null;
  food: Tri;
  foodDescription: string | null;
  amplifiedSound: Tri;
  externalGuests: Tri;
  guestSpeakers: Tri;
  alcohol: Tri;
  minors: Tri;
  avNeeds: AvItem[];
  layout: Layout | null;
  roomTypeHints: RoomType[];
  preferredBuilding: string | null;
  missingRequiredFields: FactField[];
  ambiguities: Ambiguity[];
}

// ---------- decision ----------

export interface PolicyFlag {
  ruleId: string;
  effect: PolicyEffect;
  scope: PolicyScope;
  message: string; // "Food isn't permitted in Thornton Hall 326"
  roomId?: string;
}

export type RuleStatus = "pass" | "warn" | "block" | "permit" | "escalate" | "info";

/** One checklist row, evaluated for the decision's target room. */
export interface PolicyRuleResult {
  ruleId: string;
  title: string;
  status: RuleStatus;
  detail: string; // "45 attendees ≤ 52 fire capacity"
}

export interface RoomEvaluation {
  roomId: string;
  eligible: boolean;
  conflicts: PolicyFlag[]; // BLOCK_ROOM flags for this room
  warnings: PolicyFlag[]; // WARN flags for this room
}

export type PermitId = "EHS_TEMP_FOOD" | "GUEST_SPEAKER";

export interface PermitRequirement {
  permitId: PermitId;
  ruleId: string;
  name: string; // "EHS Temporary Food Permit"
  office: string;
  /** Deterministically pre-filled form fields (label → value). */
  fields: { label: string; value: string }[];
}

export interface Unresolved {
  field: FactField | null;
  question: string;
}

/** THE canonical decision. Only lib/policy.ts creates it. */
export interface PolicyDecision {
  tier: 1 | 2 | 3;
  /** True only for tier 1 with all fields resolved, defaults attested, eligible target room, cap ok. */
  canAutoApprove: boolean;
  needsInfo: boolean;
  eventFlags: PolicyFlag[]; // event-scope flags (permits, escalations, warns)
  hardBlocks: PolicyFlag[]; // BLOCK_REQUEST flags: nothing can be booked until fixed (e.g. daily cap)
  rooms: RoomEvaluation[]; // one per room, room-scope compatibility only
  /** Room the decision is evaluated against: requested room → best in preferred building → best overall. */
  targetRoomId: string | null;
  /** Set when target is ineligible and an eligible alternative exists — powers "Fix It". */
  suggestedRoomId: string | null;
  permitsRequired: PermitRequirement[];
  applicableRules: PolicyRuleResult[];
  unresolved: Unresolved[];
  /** Fields filled by contextual defaults that the officer must attest to. */
  defaultsToAttest: FactField[];
  clubMinutesUsed: number; // already booked that day, before this request
  clubMinutesCap: number;
  requestMinutes: number | null;
  /** Officer may submit now (target room eligible, no hard blocks, nothing unresolved, defaults attested). */
  canSubmit: boolean;
  /** What submitting creates: T1 → confirmed, T2 → pending_permit (or confirmed if no permit), T3 → pending_review. */
  submitOutcome: BookingStatus | null;
  /** One-line deterministic status, e.g. "Needs one change: food isn't allowed in Thornton Hall 326". */
  headline: string;
}

export interface EvaluateContext {
  rooms: Room[];
  bookings: Booking[];
  clubId: string;
  attested: boolean;
}

// ---------- ranking ----------

export interface RankReason {
  label: string; // "Seats 48 for 45 attendees"
  kind: "fit" | "miss" | "pref";
}

export interface RankedRoom {
  room: Room;
  evaluation: RoomEvaluation;
  /** 1-based among eligible rooms; null when ineligible. */
  rank: number | null;
  reasons: RankReason[];
  avMissing: AvItem[];
  /** One-line "why" for compact rows. */
  why: string;
}

// ---------- AI writer ----------

export interface WriterOutput {
  headline: string;
  explanation: string; // plain-English explanation for the officer
  permitNarrative: string | null; // tier 2: narrative section for the permit draft
  briefing: {
    summary: string;
    riskPoints: { ruleId: string; point: string }[];
    staffQuestions: string[];
  } | null; // tier 3 only
  citedRuleIds: string[]; // validated against policy.json; unknown ids stripped
}

export type AiMode = "live" | "fallback" | "none";

// ---------- bookings & audit ----------

export type BookingStatus = "confirmed" | "pending_permit" | "pending_review" | "denied" | "cancelled";

export interface Booking {
  id: string;
  roomId: string;
  clubId: string;
  date: ISODate;
  startTime: HHMM;
  endTime: HHMM;
  durationMin: number;
  status: BookingStatus;
  title: string;
  /** Optional officer-written description of the event. */
  description?: string | null;
  tier: 1 | 2 | 3;
  snapshotId: string | null;
  createdAt: string; // ISO timestamp
}

export interface BookingRequest {
  clubId: string;
  roomId: string;
  facts: EventFacts;
  attested: boolean;
  requestText: string | null;
  draft: EventDraft | null;
  writer: WriterOutput | null;
  /** Officer-entered event name; the server falls back to the extracted summary when blank. */
  eventName?: string | null;
  eventDescription?: string | null;
}

export type CreateBookingResult =
  | { ok: true; booking: Booking; decision: PolicyDecision }
  | { ok: false; errors: PolicyFlag[]; decision: PolicyDecision | null };

export interface UserCorrection {
  field: FactField;
  aiValue: unknown;
  userValue: unknown;
}

export type SnapshotStatus = "auto_approved" | "permit_pending" | "pending_review" | "approved" | "denied";

/** Structured audit record. Never stores model reasoning text. */
export interface DecisionSnapshot {
  id: string;
  createdAt: string;
  clubId: string;
  requestText: string | null;
  draft: EventDraft | null;
  facts: EventFacts;
  userCorrections: UserCorrection[];
  matchedRules: string[];
  selectedRoomId: string;
  tier: 1 | 2 | 3;
  writer: WriterOutput | null;
  bookingId: string;
  status: SnapshotStatus;
  eventName?: string | null;
  eventDescription?: string | null;
}

// ---------- HTTP ----------

export type PresetId = "study" | "pizza" | "speaker" | "dance";

/** POST /api/triage body */
export interface TriageRequest {
  clubId: string;
  text?: string;
  presetId?: PresetId;
  attested?: boolean;
}

/** POST /api/triage response */
export interface TriageResponse {
  requestText: string | null;
  presetId: PresetId | null;
  draft: EventDraft | null;
  facts: EventFacts;
  decision: PolicyDecision;
  ranked: RankedRoom[];
  writer: WriterOutput | null;
  /** Bookings on facts.date — lets the client re-run evaluate() locally after chip edits. */
  bookingsForDate: Booking[];
  aiMode: AiMode;
}

/** GET /api/admin response */
export interface AdminResponse {
  pending: DecisionSnapshot[];
  log: DecisionSnapshot[];
  counts: { autoApproved: number; permitAssisted: number; escalated: number };
}

/** POST /api/admin body */
export interface AdminActionRequest {
  snapshotId: string;
  action: "approve" | "deny";
}

export const DAILY_CAP_MIN = 180;
export const DEFAULT_ANCHOR_DATE = "2026-10-05";
