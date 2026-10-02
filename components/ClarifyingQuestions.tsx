"use client";
/**
 * ClarifyingQuestions — OWNER: C2. Shown when decision.unresolved is non-empty.
 *
 * Heading: "Before we can book" + muted "We never assume these — please answer."
 * One row per question. Tri-state fields (food, amplifiedSound, externalGuests, guestSpeakers,
 * alcohol, minors) get Yes / No buttons → onAnswer(field, true|false).
 * headcount → number input; date/startTime/endTime → date/time inputs.
 * Questions with field === null (rare) show as text only.
 * Also show `ambiguities` from the AI draft as muted notes (dedupe by field with `questions`).
 * Must be keyboard accessible; focus the first unanswered control when it appears.
 */
import { Placeholder } from "@/components/ui";
import type { EditFact } from "@/lib/client/uiTypes";
import type { Ambiguity, EventFacts, Unresolved } from "@/lib/types";

export interface ClarifyingQuestionsProps {
  questions: Unresolved[];
  ambiguities: Ambiguity[];
  facts: EventFacts;
  onAnswer: EditFact;
}

export function ClarifyingQuestions({ questions }: ClarifyingQuestionsProps) {
  return <Placeholder name="ClarifyingQuestions">{questions.map((q) => q.question).join(" / ")}</Placeholder>;
}
