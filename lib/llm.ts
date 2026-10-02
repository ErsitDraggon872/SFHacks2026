/**
 * GatorSpace LLM Integration — OWNER: C3.
 * Split models via @google/genai:
 *   - Extractor: gemini-3.5-flash-lite (fast structured JSON parsing into EventDraft)
 *   - Writer: gemini-3.8-flash (high-quality admin explanations, briefings, and permit drafts)
 *
 * Fallback chain: Primary Model → Secondary Model → demo-cache.json / deterministic fallback.
 * Strictly enforces:
 *   - Privacy: Only event text is sent to the LLM (no student names, no club name).
 *   - Policy integrity: Any cited rule IDs not present in policy.json are stripped.
 *   - Tri-state nulls: Unmentioned fields remain null (unknown), never guessed.
 */
import { GoogleGenAI } from "@google/genai";
import demoCache from "@/data/demo-cache.json";
import { POLICY_BY_ID, ROOM_BY_ID } from "./data";
import { WEAPON_CUE } from "./normalize";
import { bookedElsewhere, bookedSentence, mentionsRoom } from "./client/format";
import type {
  AiMode,
  AvItem,
  EventDraft,
  EventFacts,
  FactField,
  PolicyDecision,
  PresetId,
  Tri,
  WriterOutput,
} from "./types";

type CacheEntry = { input: string; clubId: string; expectedTier?: number; draft: EventDraft; writer: WriterOutput | null };
const CACHE = demoCache as unknown as Record<PresetId, CacheEntry>;

const DEFAULT_EXTRACTOR_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_WRITER_MODEL = "gemini-3.8-flash";

function getExtractorModel(): string {
  return process.env.GEMINI_EXTRACTOR_MODEL || DEFAULT_EXTRACTOR_MODEL;
}

function getWriterModel(): string {
  return process.env.GEMINI_WRITER_MODEL || DEFAULT_WRITER_MODEL;
}

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

// ---------- Extractor Schema & Prompt ----------

const EXTRACTOR_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", nullable: true },
    headcount: { type: "INTEGER", nullable: true },
    whenPhrase: { type: "STRING", nullable: true },
    food: { type: "BOOLEAN", nullable: true },
    foodDescription: { type: "STRING", nullable: true },
    amplifiedSound: { type: "BOOLEAN", nullable: true },
    externalGuests: { type: "BOOLEAN", nullable: true },
    guestSpeakers: { type: "BOOLEAN", nullable: true },
    alcohol: { type: "BOOLEAN", nullable: true },
    minors: { type: "BOOLEAN", nullable: true },
    weapons: { type: "BOOLEAN", nullable: true },
    avNeeds: {
      type: "ARRAY",
      items: {
        type: "STRING",
        enum: ["projector", "display", "microphone", "speakers", "whiteboard", "video_conf", "computers", "piano"],
      },
    },
    layout: {
      type: "STRING",
      nullable: true,
      enum: ["lecture", "classroom", "seminar", "open", "lab", "studio"],
    },
    roomTypeHints: {
      type: "ARRAY",
      items: {
        type: "STRING",
        enum: ["lecture_hall", "classroom", "seminar", "multipurpose", "lab", "study_room", "studio"],
      },
    },
    preferredBuilding: { type: "STRING", nullable: true },
    missingRequiredFields: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    ambiguities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING", nullable: true },
          question: { type: "STRING" },
        },
        required: ["question"],
      },
    },
  },
  required: ["missingRequiredFields", "ambiguities", "avNeeds", "roomTypeHints"],
};

const EXTRACTOR_SYSTEM_PROMPT = `You are the event intake extractor for GatorSpace at San Francisco State University (SFSU).
Your task is to parse a student event description into a structured JSON EventDraft according to SFSU facility policies.

CRITICAL RULES:
1. NEVER invent or assume values. If a field is not explicitly mentioned or directly stated in the text, use null.
2. TRI-STATE POLICY FIELDS (food, amplifiedSound, externalGuests, guestSpeakers, alcohol, minors, weapons):
   - weapons: true for any firearm, knife, or other weapon, including props, replicas, airsoft or demonstrations, even when phrased as a question ("can I bring a gun?").
   - true: explicitly mentioned or clearly stated as occurring
   - false: explicitly stated as NOT occurring (e.g. "no alcohol", "members only, no outside guests")
   - null: unmentioned, uncertain, or ambiguous
3. RAW TIME PHRASE: Extract the exact raw phrase describing date and time into whenPhrase (e.g. "Thursday 6-9pm", "next Tuesday afternoon", "Wednesday 4-6pm"). Do not guess calendar dates.
4. REQUIRED FIELDS: A complete booking requires headcount, date, startTime, and endTime.
   - If headcount is missing or unspecified, include "headcount" in missingRequiredFields.
   - If whenPhrase is missing or lacks start/end time, include "date", "startTime", or "endTime" in missingRequiredFields.
5. AMBIGUITIES & CLARIFYING QUESTIONS:
   - When policy-sensitive items are likely or ambiguous (e.g., food at a "dinner" or "banquet", alcohol at a night social, non-SFSU guests at a "networking" or "community" event, minors at high school visits), generate a concise, polite clarifying question in ambiguities: { field, question }.
   - If headcount or time is missing, add a clarifying question to ambiguities.
6. AV NEEDS: Only include items directly mentioned (projector, display, microphone, speakers, whiteboard, video_conf, computers, piano).
7. PRIVACY: Process ONLY the event description text. Never extract or output personal names, student IDs, or student organization names.`;

// ---------- Writer Schema & Prompt ----------

const WRITER_SCHEMA = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING" },
    explanation: { type: "STRING" },
    permitNarrative: { type: "STRING", nullable: true },
    briefing: {
      type: "OBJECT",
      nullable: true,
      properties: {
        summary: { type: "STRING" },
        riskPoints: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              ruleId: { type: "STRING" },
              point: { type: "STRING" },
            },
            required: ["ruleId", "point"],
          },
        },
        staffQuestions: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
      },
      required: ["summary", "riskPoints", "staffQuestions"],
    },
    citedRuleIds: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
  required: ["headline", "explanation", "citedRuleIds"],
};

const WRITER_SYSTEM_PROMPT = `You are the policy explanation writer for GatorSpace at SFSU.
You write clear, professional, and explainable summaries of policy decisions for student organizers and SA&E staff.

CRITICAL RULES:
1. ONLY cite the exact rule IDs provided in the policy excerpts, and ONLY in the citedRuleIds and riskPoints[].ruleId fields. NEVER invent rule IDs.
   NEVER write rule IDs (e.g. "FOOD-01", "SIZE-02") in headline, explanation, permitNarrative, summary, riskPoints[].point, or staffQuestions — students find them confusing. Describe the rule in plain words instead (e.g. "food isn't allowed in this classroom").
   Likewise refer to rooms by name (targetRoomName / suggestedRoomName), never by room ID like "GYM-129".
2. For Tier 2 (Resolvable conflicts or permits required):
   - headline: A supportive, actionable summary (e.g., "Almost there — move to a room that allows food").
   - explanation: Explain what works, why the current room conflicts, what alternative room fixes it, and what permits are needed.
   - permitNarrative: If a food or speaker permit is required, provide a professional 2-3 sentence description pre-filling the permit narrative.
   - briefing: Must be null.
3. For Tier 3 (Escalated review required):
   - headline: "Staff review required — briefing prepared"
   - explanation: Explain why staff review is required (e.g., event size > 100, external speakers, alcohol, minors, weapons).
   - permitNarrative: Pre-filled narrative if applicable.
   - briefing: An executive briefing for Student Activities & Events staff including:
     - summary: Concise overview of who, what, when, headcount, and location fit.
     - riskPoints: Array of { ruleId, point } addressing each policy concern.
     - staffQuestions: 2-3 specific questions staff should verify with the organizer.
4. bookedRooms lists rooms that would otherwise fit but are already booked at the requested time. If it is non-empty, the explanation MUST name each of those rooms and its booked time in one short sentence (e.g. "Gymnasium 129 is already booked 7 PM–8:30 PM."), because organizers want to know.
5. TONE: Helpful, administrative, precise. Never scold or lecture.`;

// ---------- Strip Markdown Formatting ----------

function parseJsonClean(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// ---------- Timeout ----------

const MODEL_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 8000;

/** Runs one model call with a hard deadline so a slow API can't hang /api/triage. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = MODEL_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Model call timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Offline Heuristic Fallback Extractor ----------

const PEOPLE_WORDS = "people|persons|ppl|folks|attendees|members|students|guests|participants";

/** Headcount from explicit phrasing only ("30 people", "25 of our members", "for 80"), never the first stray number. */
function parseHeadcount(text: string): number | null {
  const patterns = [
    new RegExp(`\\b(\\d{1,4})\\s*(?:${PEOPLE_WORDS})\\b`, "i"),
    new RegExp(`\\b(\\d{1,4})\\s+of\\s+(?:our|the|my)\\s+(?:${PEOPLE_WORDS})\\b`, "i"),
    /\b(?:headcount|capacity|expecting|expect)\s*(?:of|:)?\s*(?:about|around|~)?\s*(\d{1,4})\b/i,
    // "for 80", but not "for 6-9pm", "for 6pm", "for 2 hours"
    /\bfor\s+(?:about\s+|around\s+|~\s*|up\s+to\s+)?(\d{1,4})\b(?!\s*(?::|-|–|—|to\b|am\b|pm\b|a\.m|p\.m|hours?\b|hrs?\b|minutes?\b|mins?\b))/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Tri-state from text: false when explicitly negated, true when mentioned, null otherwise. */
function triState(text: string, positive: RegExp, negative?: RegExp): Tri {
  if (negative?.test(text)) return false;
  return positive.test(text) ? true : null;
}

function extractOffline(text: string): EventDraft {
  const lower = text.trim().toLowerCase();

  // Exact preset text only. A keyword match must not pull in a preset's draft: that would
  // invent headcounts and times the user never gave.
  for (const presetKey of Object.keys(CACHE) as PresetId[]) {
    const entry = CACHE[presetKey];
    if (entry && lower === entry.input.trim().toLowerCase()) {
      return structuredClone(entry.draft);
    }
  }

  const headcount = parseHeadcount(text);

  const whenMatch = text.match(
    /\b(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\s+)?(?:from\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  );
  const whenPhrase = whenMatch ? whenMatch[0].trim() : null;

  const food = triState(
    text,
    /\b(food|pizza|snacks?|dinner|lunch|breakfast|catering|catered|refreshments|boba|banquet)\b/i,
    /\bno\s+(food|snacks|refreshments)\b/i,
  );
  const amplifiedSound = triState(
    text,
    /\b(dj|music|amplified|microphones?|mics?|sound system|band|karaoke)\b/i,
    /\bno\s+(music|amplified sound|amplification)\b/i,
  );
  const externalGuests = triState(
    text,
    /\b(public|external|alumni|community members|recruiters?|non-sfsu|outside guests|guest speakers?)\b/i,
    /\b(members only|no outside guests|sfsu students only|students only)\b/i,
  );
  const guestSpeakers = triState(text, /\b(guest speakers?|panel(?:ists)?|keynote|talk by)\b/i);
  const alcohol = triState(text, /\b(alcohol|beer|wine|cocktails?|bar service)\b/i, /\b(no alcohol|alcohol-free|dry event)\b/i);
  const minors = triState(text, /\b(minors?|youth|k-12|high school(?:ers)?|under 18)\b/i);
  const weapons = triState(text, WEAPON_CUE, /\bno\s+(weapons?|guns?|firearms?)\b/i);

  const avNeeds: AvItem[] = [];
  if (/\bprojectors?\b/i.test(text)) avNeeds.push("projector");
  if (/\b(microphones?|mics?)\b/i.test(text)) avNeeds.push("microphone");
  if (/\bwhiteboards?\b/i.test(text)) avNeeds.push("whiteboard");
  if (/\b(speakers?\s+for\s+(?:music|sound|audio)|sound system)\b/i.test(text)) avNeeds.push("speakers");

  const missing: FactField[] = [];
  const ambiguities: { field: FactField | null; question: string }[] = [];
  const ask = (field: FactField, question: string) => {
    if (!ambiguities.some((a) => a.field === field)) ambiguities.push({ field, question });
  };

  if (headcount === null) {
    missing.push("headcount");
    ask("headcount", "How many people are expected to attend?");
  }
  if (!whenPhrase) {
    missing.push("date", "startTime", "endTime");
    ask("date", "What date and time range is the event scheduled for?");
  }

  const social = /\b(dinner|banquet|reception|gala|social|mixer|party|networking)\b/i.test(text);
  const outwardFacing = /\b(networking|mixer|career|community|fair|reception|showcase|open house)\b/i.test(text);

  if (food === true && /\b(dinner|banquet|reception|catering|catered)\b/i.test(text)) {
    ask("food", "Will food be provided by a licensed vendor?");
  }
  if (externalGuests === null && (outwardFacing || (headcount !== null && headcount > 50))) {
    ask("externalGuests", "Will any attendees be unaffiliated with SFSU?");
  }
  if (alcohol === null && social) {
    ask("alcohol", "Will alcohol be served at this event?");
  }

  const summary = text.split(/[.,;!?]|\s+for\s+/i)[0].trim().slice(0, 60) || null;

  return {
    summary,
    headcount,
    whenPhrase,
    food,
    foodDescription: food === true ? "Food mentioned in description" : null,
    amplifiedSound,
    externalGuests,
    guestSpeakers,
    alcohol,
    minors,
    weapons,
    avNeeds,
    layout: null,
    roomTypeHints: [],
    preferredBuilding: null,
    missingRequiredFields: missing,
    ambiguities,
  };
}

// ---------- Deterministic Offline Writer ----------

function flaggedRuleIdsOf(decision: PolicyDecision): string[] {
  return [...new Set(decision.applicableRules.filter((r) => r.status !== "pass").map((r) => r.ruleId))].filter(
    (id) => id in POLICY_BY_ID,
  );
}

function roomLabel(roomId: string | null): string | null {
  if (!roomId) return null;
  return ROOM_BY_ID[roomId]?.name ?? roomId;
}

/** Built from this event's own facts and decision only, never another preset's text. */
function offlineBriefing(facts: EventFacts, decision: PolicyDecision): NonNullable<WriterOutput["briefing"]> {
  const riskPoints = flaggedRuleIdsOf(decision).map((ruleId) => {
    const rule = POLICY_BY_ID[ruleId];
    return { ruleId, point: `${rule.title}: ${rule.excerpt}` };
  });
  const staffQuestions =
    decision.unresolved.length > 0
      ? decision.unresolved.map((u) => u.question)
      : ["Is the event open to non-SFSU attendees?", "Has an on-site safety lead been designated?"];
  const time = facts.startTime.value ? `${facts.startTime.value}–${facts.endTime.value ?? "?"}` : null;
  const when = [facts.date.value, time].filter(Boolean).join(" ");
  return {
    summary: `${facts.summary.value || "Event"} for ${facts.headcount.value ?? "an unspecified number of"} attendees${when ? ` on ${when}` : ""}.`,
    riskPoints,
    staffQuestions,
  };
}

function offlinePermitNarrative(facts: EventFacts, decision: PolicyDecision): string | null {
  const parts: string[] = [];
  const what = `${facts.summary.value || "Student event"} for about ${facts.headcount.value ?? "an unspecified number of"} attendees`;
  if (decision.permitsRequired.some((p) => p.permitId === "EHS_TEMP_FOOD")) {
    parts.push(`${what}. Food (${facts.foodDescription.value || "as described"}) will be sourced ready-to-serve from a licensed vendor.`);
  }
  if (decision.permitsRequired.some((p) => p.permitId === "GUEST_SPEAKER")) {
    parts.push(`${parts.length ? "The event" : what} includes invited guest speakers; speaker details will be provided to SA&E.`);
  }
  return parts.length ? parts.join(" ") : null;
}

/** Organizers want to know which fitting rooms are taken: append any the explanation didn't name. */
function withBookedNote(explanation: string, decision: PolicyDecision): string {
  const missing = bookedElsewhere(decision).filter((r) => !mentionsRoom(explanation, r.name));
  return missing.length ? `${explanation.trim()} ${bookedSentence(missing)}` : explanation;
}

function writeOffline(facts: EventFacts, decision: PolicyDecision): WriterOutput {
  const citedRuleIds = flaggedRuleIdsOf(decision);
  const permitNarrative = offlinePermitNarrative(facts, decision);

  if (decision.tier !== 3) {
    let explanation = decision.headline;
    const suggested = roomLabel(decision.suggestedRoomId);
    if (suggested) explanation += ` Consider switching to ${suggested} to resolve the room conflict.`;
    if (decision.permitsRequired.length > 0) {
      explanation += ` Required before confirmation: ${decision.permitsRequired.map((p) => p.name).join(", ")}.`;
    }
    return { headline: decision.headline, explanation: withBookedNote(explanation, decision), permitNarrative, briefing: null, citedRuleIds };
  }

  return {
    headline: "Staff review required — briefing prepared",
    explanation: withBookedNote(`This event requires review by Student Activities & Events${citedRuleIds.length ? ` (${citedRuleIds.map((id) => POLICY_BY_ID[id].title.toLowerCase()).join(", ")})` : ""}. A staff briefing has been prepared.`, decision),
    permitNarrative,
    briefing: offlineBriefing(facts, decision),
    citedRuleIds,
  };
}

// ---------- Validate & Sanitize Writer Output ----------

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Model output is untrusted: require the fields the UI renders, drop unknown rule IDs, and make the
 * briefing match the tier (Tier 2: none, Tier 3: always present). Throws if unusable.
 */
function sanitizeWriterOutput(raw: unknown, facts: EventFacts, decision: PolicyDecision): WriterOutput {
  const w = (raw ?? {}) as Partial<WriterOutput>;
  if (!nonEmpty(w.headline) || !nonEmpty(w.explanation)) {
    throw new Error("Writer output missing headline or explanation");
  }
  const valid = (id: unknown): id is string => typeof id === "string" && id in POLICY_BY_ID;
  const citedRuleIds = Array.isArray(w.citedRuleIds) ? [...new Set(w.citedRuleIds.filter(valid))] : [];

  let briefing: WriterOutput["briefing"] = null;
  if (decision.tier === 3) {
    const b = w.briefing;
    const riskPoints = Array.isArray(b?.riskPoints)
      ? b.riskPoints.filter((rp) => valid(rp?.ruleId) && nonEmpty(rp?.point))
      : [];
    const staffQuestions = Array.isArray(b?.staffQuestions) ? b.staffQuestions.filter(nonEmpty) : [];
    const fallback = offlineBriefing(facts, decision);
    briefing = {
      summary: nonEmpty(b?.summary) ? b.summary : fallback.summary,
      riskPoints: riskPoints.length ? riskPoints : fallback.riskPoints,
      staffQuestions: staffQuestions.length ? staffQuestions : fallback.staffQuestions,
    };
  }

  return {
    headline: w.headline,
    explanation: withBookedNote(w.explanation, decision),
    permitNarrative: nonEmpty(w.permitNarrative) ? w.permitNarrative : null,
    briefing,
    citedRuleIds,
  };
}

// ==============================================================================
// PUBLIC CONTRACT FUNCTIONS
// ==============================================================================

/**
 * Extract an EventDraft from free-form user text.
 * Uses the extractor model with fallback to Flash, then the offline parser.
 * Only event description text is sent (privacy-preserving).
 */
export async function extractEvent(text: string): Promise<{ draft: EventDraft; aiMode: AiMode }> {
  const client = getClient();
  if (!client) {
    return { draft: extractOffline(text), aiMode: "fallback" };
  }

  const primaryModel = getExtractorModel();
  const modelsToTry = [primaryModel, "gemini-3.8-flash"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout((abortSignal) =>
        client.models.generateContent({
          model,
          contents: text,
          config: {
            systemInstruction: EXTRACTOR_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: EXTRACTOR_SCHEMA as unknown as Record<string, unknown>,
            abortSignal,
          },
        }),
      );

      const responseText = response.text;
      if (!responseText) continue;

      // Raw on purpose: prepare() (lib/sanitize.ts) validates and normalizes the draft.
      return { draft: parseJsonClean(responseText) as EventDraft, aiMode: "live" };
    } catch (err) {
      console.warn(`Extraction with ${model} failed:`, err);
    }
  }

  return { draft: extractOffline(text), aiMode: "fallback" };
}

/**
 * Write a policy explanation, briefing, and permit narrative based on structured facts and decision.
 * Receives ONLY structured facts + decision + cited rule excerpts (no club or personal data).
 * Output is validated; cited rule IDs not present in policy.json are stripped.
 */
export async function writeExplanation(facts: EventFacts, decision: PolicyDecision): Promise<WriterOutput> {
  const client = getClient();
  if (!client) {
    return writeOffline(facts, decision);
  }

  const applicableExcerpts = decision.applicableRules.map((r) => {
    const meta = POLICY_BY_ID[r.ruleId];
    return {
      ruleId: r.ruleId,
      title: r.title,
      status: r.status,
      detail: r.detail,
      excerpt: meta?.excerpt ?? "",
      effect: meta?.effect ?? "",
      office: meta?.office ?? "",
    };
  });

  const payload = {
    tier: decision.tier,
    headline: decision.headline,
    canAutoApprove: decision.canAutoApprove,
    targetRoomId: decision.targetRoomId,
    suggestedRoomId: decision.suggestedRoomId,
    targetRoomName: decision.targetRoomId ? ROOM_BY_ID[decision.targetRoomId]?.name ?? null : null,
    suggestedRoomName: decision.suggestedRoomId ? ROOM_BY_ID[decision.suggestedRoomId]?.name ?? null : null,
    permitsRequired: decision.permitsRequired,
    eventFlags: decision.eventFlags,
    facts: {
      summary: facts.summary.value,
      headcount: facts.headcount.value,
      date: facts.date.value,
      startTime: facts.startTime.value,
      endTime: facts.endTime.value,
      food: facts.food.value,
      foodDescription: facts.foodDescription.value,
      amplifiedSound: facts.amplifiedSound.value,
      externalGuests: facts.externalGuests.value,
      guestSpeakers: facts.guestSpeakers.value,
      alcohol: facts.alcohol.value,
      minors: facts.minors.value,
      weapons: facts.weapons.value,
      avNeeds: facts.avNeeds.value,
      preferredBuilding: facts.preferredBuilding.value,
    },
    policyExcerpts: applicableExcerpts,
    bookedRooms: bookedElsewhere(decision).map(({ name, time }) => ({ name, time })),
  };

  const primaryModel = getWriterModel();
  const modelsToTry = [primaryModel, "gemini-3.5-flash-lite"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout((abortSignal) =>
        client.models.generateContent({
          model,
          contents: JSON.stringify(payload),
          config: {
            systemInstruction: WRITER_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: WRITER_SCHEMA as unknown as Record<string, unknown>,
            abortSignal,
          },
        }),
      );

      const responseText = response.text;
      if (!responseText) continue;

      return sanitizeWriterOutput(parseJsonClean(responseText), facts, decision);
    } catch (err) {
      console.warn(`Writer with ${model} failed:`, err);
    }
  }

  return writeOffline(facts, decision);
}
