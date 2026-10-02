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
import { useEffect, useRef } from "react";
import { Button, Card, Input, StatusIcon } from "@/components/ui";
import type { EditFact } from "@/lib/client/uiTypes";
import { SAFETY_FIELDS, type Ambiguity, type EventFacts, type FactField, type SafetyField, type Unresolved } from "@/lib/types";

export interface ClarifyingQuestionsProps {
  questions: Unresolved[];
  ambiguities: Ambiguity[];
  facts: EventFacts;
  onAnswer: EditFact;
}

const IS_SAFETY = (f: FactField | null): f is SafetyField =>
  f !== null && (SAFETY_FIELDS as readonly string[]).includes(f);

export function ClarifyingQuestions({ questions, ambiguities, facts, onAnswer }: ClarifyingQuestionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = containerRef.current?.querySelector<HTMLElement>("button, input");
    first?.focus({ preventScroll: true });
  }, [questions.length]);

  const questionFields = new Set(questions.map((q) => q.field).filter(Boolean));
  const extraAmbiguities = ambiguities.filter((a) => !a.field || !questionFields.has(a.field));

  return (
    <Card className="border-warn/30 bg-warn-soft/40 p-5">
      <div className="flex items-start gap-2.5">
        <StatusIcon status="warn" className="mt-0.5 h-5 w-5" />
        <div>
          <h2 className="text-sm font-semibold text-ink">Before we can book</h2>
          <p className="text-xs text-muted">We never assume these — please answer.</p>
        </div>
      </div>

      <div ref={containerRef} className="mt-4 divide-y divide-line">
        {questions.map((q, idx) => {
          const field = q.field;
          return (
            <div
              key={`${field ?? "q"}-${idx}`}
              className="flex flex-col justify-between gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            >
              <span className="text-sm font-medium text-ink">{q.question}</span>

              {IS_SAFETY(field) && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAnswer(field, true)}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAnswer(field, false)}
                  >
                    No
                  </Button>
                </div>
              )}

              {field === "headcount" && (
                <form
                  className="flex shrink-0 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const n = parseInt(String(fd.get("headcount") ?? ""), 10);
                    if (Number.isFinite(n) && n > 0) onAnswer("headcount", n);
                  }}
                >
                  <Input
                    name="headcount"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="e.g. 30"
                    defaultValue={facts.headcount.value ?? ""}
                    aria-label={q.question}
                    className="w-28"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Set
                  </Button>
                </form>
              )}

              {field === "date" && (
                <Input
                  type="date"
                  value={facts.date.value ?? ""}
                  aria-label={q.question}
                  onChange={(e) => onAnswer("date", e.target.value || null)}
                  className="w-40"
                />
              )}

              {(field === "startTime" || field === "endTime") && (
                <Input
                  type="time"
                  value={facts[field].value ?? ""}
                  aria-label={q.question}
                  onChange={(e) => onAnswer(field, e.target.value || null)}
                  className="w-32"
                />
              )}
            </div>
          );
        })}
      </div>

      {extraAmbiguities.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
          {extraAmbiguities.map((a, i) => (
            <li key={i}>{a.question}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

