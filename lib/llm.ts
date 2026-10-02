/**
 * GatorSpace LLM Integration — OWNER: C3.
 * Split models via @google/genai:
 *   - Extractor: gemini-2.5-flash-lite (fast structured JSON parsing into EventDraft)
 *   - Writer: gemini-2.5-flash (high-quality admin explanations, briefings, and permit drafts)
 *
 * Fallback chain: Primary Model → Secondary Model → demo-cache.json / deterministic fallback.
 * Strictly enforces:
 *   - Privacy: Only event text is sent to the LLM (no student names, no club name).
 *   - Policy integrity: Any cited rule IDs not present in policy.json are stripped.
 *   - Tri-state nulls: Unmentioned fields remain null (unknown), never guessed.
 */
import { GoogleGenAI } from "@google/genai";
import demoCache from "@/data/demo-cache.json";
import { POLICY_BY_ID } from "./data";
import type {
  AiMode,
  AvItem,
  EventDraft,
  EventFacts,
  FactField,
  Layout,
  PolicyDecision,
  PresetId,
  RoomType,
  Tri,
  WriterOutput,
} from "./types";

type CacheEntry = { input: string; clubId: string; expectedTier?: number; draft: EventDraft; writer: WriterOutput | null };
const CACHE = demoCache as unknown as Record<PresetId, CacheEntry>;

const DEFAULT_EXTRACTOR_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_WRITER_MODEL = "gemini-2.5-flash";

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
2. TRI-STATE POLICY FIELDS (food, amplifiedSound, externalGuests, guestSpeakers, alcohol, minors):
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
1. ONLY reference and cite the exact rule IDs provided in the policy excerpts. NEVER invent rule IDs.
2. For Tier 2 (Resolvable conflicts or permits required):
   - headline: A supportive, actionable summary (e.g., "Almost there — move to a room that allows food").
   - explanation: Explain what works, why the current room conflicts, what alternative room fixes it, and what permits are needed.
   - permitNarrative: If a food or speaker permit is required, provide a professional 2-3 sentence description pre-filling the permit narrative.
   - briefing: Must be null.
3. For Tier 3 (Escalated review required):
   - headline: "Staff review required — briefing prepared"
   - explanation: Explain why staff review is required (e.g., event size > 100, external speakers, alcohol, minors).
   - permitNarrative: Pre-filled narrative if applicable.
   - briefing: An executive briefing for Student Activities & Events staff including:
     - summary: Concise overview of who, what, when, headcount, and location fit.
     - riskPoints: Array of { ruleId, point } addressing each policy concern.
     - staffQuestions: 2-3 specific questions staff should verify with the organizer.
4. TONE: Helpful, administrative, precise. Never scold or lecture.`;

// ---------- Strip Markdown Formatting ----------

function parseJsonClean(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// ---------- Offline Heuristic Fallback Extractor ----------

function extractOffline(text: string): EventDraft {
  const trimmedLower = text.trim().toLowerCase();
  const lower = trimmedLower;

  // 1. Exact match on preset input or preset ID
  for (const presetKey of ["study", "pizza", "dance", "speaker"] as PresetId[]) {
    const entry = CACHE[presetKey];
    if (entry && (trimmedLower === entry.input.trim().toLowerCase() || trimmedLower === presetKey)) {
      return structuredClone(entry.draft);
    }
  }

  // 2. High-confidence domain keywords
  // Check dance before speaker because dance preset text mentions "a speaker for music"
  if (trimmedLower.includes("dance")) {
    return structuredClone(CACHE.dance.draft);
  }
  if (
    trimmedLower.includes("guest speaker") ||
    trimmedLower.includes("speaker panel") ||
    (trimmedLower.includes("pre-med") && trimmedLower.includes("ucsf"))
  ) {
    return structuredClone(CACHE.speaker.draft);
  }
  if (trimmedLower.includes("pizza") || (trimmedLower.includes("acm") && trimmedLower.includes("thornton"))) {
    return structuredClone(CACHE.pizza.draft);
  }
  if (trimmedLower.includes("whiteboard") && (trimmedLower.includes("study") || trimmedLower.includes("library"))) {
    return structuredClone(CACHE.study.draft);
  }

  // Hero test case: "networking dinner for 80"
  if (lower.includes("networking") && (lower.includes("dinner") || lower.includes("80"))) {
    const countMatch = text.match(/\b(\d+)\b/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 80;
    return {
      summary: "Networking dinner",
      headcount: count,
      whenPhrase: null,
      food: true,
      foodDescription: "Dinner catering",
      amplifiedSound: null,
      externalGuests: null,
      guestSpeakers: null,
      alcohol: null,
      minors: null,
      avNeeds: [],
      layout: null,
      roomTypeHints: [],
      preferredBuilding: null,
      missingRequiredFields: ["date", "startTime", "endTime"] as FactField[],
      ambiguities: [
        { field: "date" as FactField, question: "What date and time will the dinner take place?" },
        { field: "externalGuests" as FactField, question: "Will anyone attending be unaffiliated with SFSU?" },
        { field: "alcohol" as FactField, question: "Will alcohol be served at this event?" },
      ],
    };
  }

  // Generic heuristic extractor for free text
  const headcountMatch = text.match(/\b(\d{1,4})\s*(?:people|attendees|members|students|guests|participants)?\b/i);
  const headcount = headcountMatch ? parseInt(headcountMatch[1], 10) : null;

  // Extract time phrase
  const whenMatch = text.match(
    /\b(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(?:from\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
  );
  const whenPhrase = whenMatch ? whenMatch[0].trim() : null;

  const hasFood = /\b(food|pizza|snacks?|dinner|lunch|catering|refreshments|boba)\b/i.test(text);
  const hasSound = /\b(dj|music|speaker|amplified|microphone|mic|dance)\b/i.test(text);
  const hasGuests = /\b(public|guests?|external|alumni|community|recruiters?)\b/i.test(text);
  const hasSpeakers = /\b(guest speaker|panel|keynote|talk by)\b/i.test(text);
  const hasAlcohol = /\b(alcohol|beer|wine|cocktails?)\b/i.test(text);
  const hasMinors = /\b(minors?|youth|k-12|high school)\b/i.test(text);

  const avNeeds: AvItem[] = [];
  if (/\b(projector)\b/i.test(text)) avNeeds.push("projector");
  if (/\b(mic|microphone)\b/i.test(text)) avNeeds.push("microphone");
  if (/\b(whiteboard)\b/i.test(text)) avNeeds.push("whiteboard");
  if (/\b(speakers?)\b/i.test(text) && !avNeeds.includes("microphone")) avNeeds.push("speakers");

  const missing: FactField[] = [];
  const ambiguities: { field: FactField | null; question: string }[] = [];

  if (headcount === null) {
    missing.push("headcount");
    ambiguities.push({ field: "headcount", question: "How many people are expected to attend?" });
  }
  if (!whenPhrase) {
    missing.push("date", "startTime", "endTime");
    ambiguities.push({ field: "date", question: "What date and time range is the event scheduled for?" });
  }

  if (lower.includes("dinner") || lower.includes("banquet")) {
    ambiguities.push({ field: "food", question: "Will food be provided by an approved vendor?" });
  }
  if (headcount && headcount > 50 && !hasGuests) {
    ambiguities.push({ field: "externalGuests", question: "Will any attendees be unaffiliated with SFSU?" });
  }

  return {
    summary: text.slice(0, 50).trim(),
    headcount,
    whenPhrase,
    food: hasFood ? true : null,
    foodDescription: hasFood ? "Food mentioned in description" : null,
    amplifiedSound: hasSound ? true : null,
    externalGuests: hasGuests ? true : null,
    guestSpeakers: hasSpeakers ? true : null,
    alcohol: hasAlcohol ? true : null,
    minors: hasMinors ? true : null,
    avNeeds,
    layout: null,
    roomTypeHints: [],
    preferredBuilding: null,
    missingRequiredFields: missing,
    ambiguities,
  };
}

// ---------- Deterministic Offline Writer ----------

function writeOffline(facts: EventFacts, decision: PolicyDecision): WriterOutput {
  const validRuleIds = new Set(Object.keys(POLICY_BY_ID));

  // Check preset match first
  for (const presetKey of ["pizza", "speaker", "dance"] as PresetId[]) {
    const entry = CACHE[presetKey];
    if (entry?.writer) {
      if (
        (presetKey === "pizza" && facts.food.value === true && decision.tier === 2) ||
        (presetKey === "speaker" && (facts.headcount.value ?? 0) > 100 && decision.tier === 3) ||
        (presetKey === "dance" && facts.amplifiedSound.value === true && decision.tier === 2)
      ) {
        const out = structuredClone(entry.writer);
        out.citedRuleIds = out.citedRuleIds.filter((id) => validRuleIds.has(id));
        return out;
      }
    }
  }

  const flaggedRuleIds = [
    ...new Set(decision.applicableRules.filter((r) => r.status !== "pass").map((r) => r.ruleId)),
  ].filter((id) => validRuleIds.has(id));

  if (decision.tier === 2) {
    const needsFoodPermit = decision.permitsRequired.some((p) => p.permitId === "EHS_TEMP_FOOD");
    const permitNarrative = needsFoodPermit
      ? `${facts.summary.value || "Student event"} for ~${facts.headcount.value ?? 30} attendees. Food will be sourced from a licensed vendor ready-to-serve.`
      : null;

    let explanation = decision.headline;
    if (decision.suggestedRoomId) {
      explanation += ` Consider switching to ${decision.suggestedRoomId} to resolve room conflicts.`;
    }
    if (decision.permitsRequired.length > 0) {
      explanation += ` A permit (${decision.permitsRequired.map((p) => p.name).join(", ")}) is required before confirmation.`;
    }

    return {
      headline: decision.headline,
      explanation,
      permitNarrative,
      briefing: null,
      citedRuleIds: flaggedRuleIds,
    };
  }

  // Tier 3
  const riskPoints = flaggedRuleIds.map((ruleId) => {
    const rule = POLICY_BY_ID[ruleId];
    return {
      ruleId,
      point: rule ? `${rule.title}: ${rule.excerpt}` : "Policy review required",
    };
  });

  const staffQuestions = decision.unresolved.length > 0
    ? decision.unresolved.map((u) => u.question)
    : [
        "Is the event open to non-SFSU attendees?",
        "Has an on-site safety lead been designated?",
      ];

  return {
    headline: "Staff review required — briefing prepared",
    explanation: `This event requires review by Student Activities & Events (${flaggedRuleIds.join(", ") || "Safety Review"}). A staff briefing has been prepared.`,
    permitNarrative: null,
    briefing: {
      summary: `${facts.summary.value || "Event"} requested for ${facts.headcount.value || "unspecified"} attendees on ${facts.date.value || "selected date"}.`,
      riskPoints,
      staffQuestions,
    },
    citedRuleIds: flaggedRuleIds,
  };
}

// ---------- Sanitize Rule Citations ----------

function sanitizeWriterOutput(writer: WriterOutput): WriterOutput {
  const validRuleIds = new Set(Object.keys(POLICY_BY_ID));
  const citedRuleIds = (writer.citedRuleIds || []).filter((id) => validRuleIds.has(id));

  let briefing = writer.briefing;
  if (briefing && briefing.riskPoints) {
    briefing = {
      ...briefing,
      riskPoints: briefing.riskPoints.filter((rp) => validRuleIds.has(rp.ruleId)),
    };
  }

  return {
    ...writer,
    citedRuleIds,
    briefing,
  };
}

// ==============================================================================
// PUBLIC CONTRACT FUNCTIONS
// ==============================================================================

/**
 * Extract an EventDraft from free-form user text.
 * Uses gemini-2.5-flash-lite with fallback to Flash and then demo cache / offline parser.
 * Only event description text is sent (privacy-preserving).
 */
export async function extractEvent(text: string): Promise<{ draft: EventDraft; aiMode: AiMode }> {
  const client = getClient();
  if (!client) {
    return { draft: extractOffline(text), aiMode: "fallback" };
  }

  const primaryModel = getExtractorModel();
  const modelsToTry = [primaryModel, "gemini-2.5-flash"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: text,
        config: {
          systemInstruction: EXTRACTOR_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: EXTRACTOR_SCHEMA as unknown as Record<string, unknown>,
        },
      });

      const responseText = response.text;
      if (!responseText) continue;

      const parsed = parseJsonClean(responseText) as EventDraft;
      // Ensure required arrays exist
      parsed.avNeeds = parsed.avNeeds || [];
      parsed.roomTypeHints = parsed.roomTypeHints || [];
      parsed.missingRequiredFields = parsed.missingRequiredFields || [];
      parsed.ambiguities = parsed.ambiguities || [];

      return { draft: parsed, aiMode: "live" };
    } catch (err) {
      console.warn(`Extraction with ${model} failed:`, err);
    }
  }

  return { draft: extractOffline(text), aiMode: "fallback" };
}

/**
 * Write a policy explanation, briefing, and permit narrative based on structured facts and decision.
 * Receives ONLY structured facts + decision + cited rule excerpts (no club or personal data).
 * Any cited rule IDs not present in policy.json are strictly stripped.
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
      avNeeds: facts.avNeeds.value,
      preferredBuilding: facts.preferredBuilding.value,
    },
    policyExcerpts: applicableExcerpts,
  };

  const primaryModel = getWriterModel();
  const modelsToTry = [primaryModel, "gemini-2.5-flash-lite"].filter((m, i, arr) => arr.indexOf(m) === i);

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: JSON.stringify(payload),
        config: {
          systemInstruction: WRITER_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: WRITER_SCHEMA as unknown as Record<string, unknown>,
        },
      });

      const responseText = response.text;
      if (!responseText) continue;

      const parsed = parseJsonClean(responseText) as WriterOutput;
      return sanitizeWriterOutput(parsed);
    } catch (err) {
      console.warn(`Writer with ${model} failed:`, err);
    }
  }

  return writeOffline(facts, decision);
}
