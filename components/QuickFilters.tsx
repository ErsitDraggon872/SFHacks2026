"use client";
/**
 * QuickFilters — OWNER: C2. The no-AI entry path (the "Filters" tab of SearchHero).
 *
 * Compact form building EventFacts directly (all source "user"):
 *   Date (input type=date), Start / End (type=time), Attendees (number),
 *   Equipment (toggle pills for projector, display, microphone, speakers, whiteboard, computers),
 *   Building (Select of unique ROOMS buildings, "Any"),
 *   Food / Amplified sound / Non-SFSU guests / Under 18 (TriToggle each).
 *   Alcohol and guest speakers have no toggle: initialFilterFacts() sets them to an assumed "no"
 *   that the officer attests to (and can still change from the fact chips).
 *   Accessible space (Checkbox).
 * Every change → onChange(nextFacts) via setFact() from lib/normalize.ts.
 * Primary "Find rooms" → onSubmit (the page then evaluates locally — instant, no network).
 * Two-column grid on desktop, one column on mobile.
 */
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { Button, Checkbox, Field, Input, PillButton, Select, TriToggle } from "@/components/ui";
import { FACT_LABEL } from "@/lib/client/format";
import { ROOMS } from "@/lib/data";
import { setFact } from "@/lib/normalize";
import { avLabel } from "@/lib/rank";
import { SAFETY_FIELDS, type AvItem, type EventFacts } from "@/lib/types";

export interface QuickFiltersProps {
  value: EventFacts;
  onChange: (facts: EventFacts) => void;
  onSubmit: () => void;
}

const FILTER_SAFETY = SAFETY_FIELDS.filter((f) => f !== "alcohol" && f !== "guestSpeakers");

const FILTER_AV: AvItem[] = [
  "projector",
  "display",
  "microphone",
  "speakers",
  "whiteboard",
  "computers",
];

export function QuickFilters({ value, onChange, onSubmit }: QuickFiltersProps) {
  const buildings = useMemo(
    () => Array.from(new Set(ROOMS.map((r) => r.building))),
    [],
  );

  const toggleAv = (item: AvItem) => {
    const cur = value.avNeeds.value;
    const next = cur.includes(item) ? cur.filter((a) => a !== item) : [...cur, item];
    onChange(setFact(value, "avNeeds", next));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date">
          <Input
            type="date"
            value={value.date.value ?? ""}
            onChange={(e) => onChange(setFact(value, "date", e.target.value || null))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <Input
              type="time"
              value={value.startTime.value ?? ""}
              onChange={(e) => onChange(setFact(value, "startTime", e.target.value || null))}
            />
          </Field>
          <Field label="End">
            <Input
              type="time"
              value={value.endTime.value ?? ""}
              onChange={(e) => onChange(setFact(value, "endTime", e.target.value || null))}
            />
          </Field>
        </div>

        <Field label="Attendees">
          <Input
            type="number"
            min={1}
            max={1000}
            placeholder="e.g. 25"
            value={value.headcount.value ?? ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange(setFact(value, "headcount", Number.isFinite(n) && n > 0 ? n : null));
            }}
          />
        </Field>

        <Field label="Building">
          <Select
            value={value.preferredBuilding.value ?? ""}
            onChange={(e) => onChange(setFact(value, "preferredBuilding", e.target.value || null))}
          >
            <option value="">Any</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Equipment */}
      <div className="space-y-1.5">
        <span className="text-sm text-ink-2">Equipment</span>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_AV.map((item) => {
            const active = value.avNeeds.value.includes(item);
            return (
              <PillButton
                key={item}
                tone={active ? "accent" : "neutral"}
                aria-pressed={active}
                onClick={() => toggleAv(item)}
              >
                {avLabel(item)}
              </PillButton>
            );
          })}
        </div>
      </div>

      {/* Tri-state safety fields */}
      <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
        {FILTER_SAFETY.map((field) => (
          <div key={field} className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink-2">{FACT_LABEL[field]}</span>
            <TriToggle
              label={FACT_LABEL[field]}
              value={value[field].value}
              onChange={(v) => onChange(setFact(value, field, v))}
            />
          </div>
        ))}
      </div>

      {/* Footer: Accessible checkbox + Find rooms */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <Checkbox
          checked={value.adaRequired.value}
          onChange={(v) => onChange(setFact(value, "adaRequired", v))}
        >
          Accessible space required
        </Checkbox>

        <Button type="submit" variant="primary">
          Find rooms
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}

