"use client";
/**
 * FactChips — OWNER: C2. "Here's what we understood" row under the search box.
 *
 * Renders one chip per meaningful fact: attendees, date + time, food, sound, guests, speakers,
 * equipment, building, plus minors only when not false, and alcohol/weapons only when yes, unknown or edited.
 * Three visual styles, chosen by `facts[field].source`:
 *   - "ai":      neutral pill
 *   - "user":    accent pill with a small pencil icon ("edited")
 *   - "default": outline (dashed) pill prefixed "Assumed:" (e.g. "Assumed: no alcohol")
 * A null tri-state shows as an amber "? Food" chip.
 * Clicking a chip opens an inline editor (TriToggle for tri-state, Input for number/time/date,
 * Select for building) → call onEdit(field, value). Escape cancels. Keyboard accessible.
 * Use `original` to show the AI's value in a tooltip when the user changed it.
 * Helpers: FACT_LABEL / fmtFactValue in lib/client/format.ts. Primitives: PillButton, TriToggle, Input.
 */
import { HelpCircle, Pencil, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, PillButton, Select, TriToggle, type PillTone } from "@/components/ui";
import { FACT_LABEL, fmtDate, fmtFactValue, fmtRange, fmtTime } from "@/lib/client/format";
import type { EditFact } from "@/lib/client/uiTypes";
import { ROOMS } from "@/lib/data";
import { avLabel } from "@/lib/rank";
import { isImpliedNo, type AvItem, type EventFacts, type FactField, type Tri } from "@/lib/types";

export interface FactChipsProps {
  facts: EventFacts;
  /** Facts as first produced by the AI/defaults (before user edits). Null for Quick Filters. */
  original: EventFacts | null;
  onEdit: EditFact;
}

const ALL_AV: AvItem[] = [
  "projector",
  "display",
  "microphone",
  "speakers",
  "whiteboard",
  "video_conf",
  "computers",
  "piano",
];

const TRI_FIELDS: FactField[] = [
  "food",
  "amplifiedSound",
  "externalGuests",
  "guestSpeakers",
  "alcohol",
  "minors",
  "weapons",
];

type ChipId =
  | "headcount"
  | "when"
  | "food"
  | "amplifiedSound"
  | "externalGuests"
  | "guestSpeakers"
  | "alcohol"
  | "minors"
  | "weapons"
  | "avNeeds"
  | "preferredBuilding"
  | "requestedRoomId";

export function FactChips({ facts, original, onEdit }: FactChipsProps) {
  const [editing, setEditing] = useState<ChipId | null>(null);
  const [headcountDraft, setHeadcountDraft] = useState<string>("");
  const [dateDraft, setDateDraft] = useState<string>("");
  const [startDraft, setStartDraft] = useState<string>("");
  const [endDraft, setEndDraft] = useState<string>("");

  const editorRef = useRef<HTMLDivElement>(null);

  const buildings = useMemo(
    () => Array.from(new Set(ROOMS.map((r) => r.building))),
    [],
  );

  useEffect(() => {
    if (!editing) return;
    const first = editorRef.current?.querySelector<HTMLElement>(
      "input, select, button[role='radio'], button",
    );
    first?.focus({ preventScroll: true });
  }, [editing]);

  const openEditor = (id: ChipId) => {
    if (editing === id) {
      setEditing(null);
      return;
    }
    if (id === "headcount") {
      setHeadcountDraft(facts.headcount.value !== null ? String(facts.headcount.value) : "");
    } else if (id === "when") {
      setDateDraft(facts.date.value ?? "");
      setStartDraft(facts.startTime.value ?? "");
      setEndDraft(facts.endTime.value ?? "");
    }
    setEditing(id);
  };

  const originalTooltip = (field: FactField): string | undefined => {
    if (!original || facts[field].source !== "user") return undefined;
    return `Original (${original[field].source}): ${fmtFactValue(field, original[field].value)}`;
  };

  const chipStyle = (field: FactField, isNull: boolean): { tone: PillTone; icon: React.ReactNode } => {
    if (isNull) {
      return { tone: "warn", icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden /> };
    }
    const src = facts[field].source;
    if (src === "user") {
      return { tone: "accent", icon: <Pencil className="h-3 w-3" aria-hidden /> };
    }
    if (src === "default") {
      return { tone: "outline", icon: null };
    }
    return { tone: "neutral", icon: null };
  };

  const whenIsNull = !facts.date.value || !facts.startTime.value || !facts.endTime.value;
  const whenIsUser =
    facts.date.source === "user" ||
    facts.startTime.source === "user" ||
    facts.endTime.source === "user";
  const whenTone: PillTone = whenIsNull ? "warn" : whenIsUser ? "accent" : "neutral";
  const whenIcon = whenIsNull ? (
    <HelpCircle className="h-3.5 w-3.5" aria-hidden />
  ) : whenIsUser ? (
    <Pencil className="h-3 w-3" aria-hidden />
  ) : null;
  const whenTooltip =
    original && whenIsUser
      ? `Original: ${fmtDate(original.date.value)} · ${fmtTime(original.startTime.value)}–${fmtTime(original.endTime.value)}`
      : undefined;

  const visibleTriFields = TRI_FIELDS.filter((field) => {
    const f = facts[field];
    // alcohol / weapons: a given "no" isn't worth a chip; show only a yes, an open question, or an edit
    if (isImpliedNo(field)) return f.value !== false || f.source === "user";
    if (field === "minors") {
      return f.value !== false || f.source === "default" || f.source === "user";
    }
    return true;
  });

  const toggleAv = (item: AvItem) => {
    const cur = facts.avNeeds.value;
    const next = cur.includes(item) ? cur.filter((a) => a !== item) : [...cur, item];
    onEdit("avNeeds", next);
  };

  return (
    <section aria-label="Understood event details" className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-muted">
          <Sparkles className="h-3 w-3 text-accent" aria-hidden />
          Understood
        </span>

        {/* Headcount */}
        {(() => {
          const isNull = facts.headcount.value === null;
          const { tone, icon } = chipStyle("headcount", isNull);
          return (
            <PillButton
              tone={tone}
              icon={icon}
              title={originalTooltip("headcount")}
              aria-expanded={editing === "headcount"}
              onClick={() => openEditor("headcount")}
            >
              {isNull ? "? Attendees" : `${facts.headcount.value} attendees`}
            </PillButton>
          );
        })()}

        {/* Date + Time */}
        <PillButton
          tone={whenTone}
          icon={whenIcon}
          title={whenTooltip}
          aria-expanded={editing === "when"}
          onClick={() => openEditor("when")}
        >
          {whenIsNull ? `? ${fmtRange(facts)}` : fmtRange(facts)}
        </PillButton>

        {/* Tri-state safety fields */}
        {visibleTriFields.map((field) => {
          const f = facts[field];
          const isNull = f.value === null;
          const { tone, icon } = chipStyle(field, isNull);
          const label = FACT_LABEL[field];
          let text: string;
          if (isNull) {
            text = `? ${label}`;
          } else if (f.source === "default") {
            text = `Assumed: ${f.value ? label.toLowerCase() : `no ${label.toLowerCase()}`}`;
          } else {
            text = `${label}: ${fmtFactValue(field, f.value)}`;
          }
          return (
            <PillButton
              key={field}
              tone={tone}
              icon={icon}
              title={originalTooltip(field)}
              aria-expanded={editing === field}
              onClick={() => openEditor(field as ChipId)}
            >
              {text}
            </PillButton>
          );
        })}

        {/* Equipment */}
        {(() => {
          const { tone, icon } = chipStyle("avNeeds", false);
          return (
            <PillButton
              tone={tone}
              icon={icon}
              title={originalTooltip("avNeeds")}
              aria-expanded={editing === "avNeeds"}
              onClick={() => openEditor("avNeeds")}
            >
              Equipment: {fmtFactValue("avNeeds", facts.avNeeds.value)}
            </PillButton>
          );
        })()}

        {/* Preferred Building */}
        {(() => {
          const { tone, icon } = chipStyle("preferredBuilding", false);
          return (
            <PillButton
              tone={tone}
              icon={icon}
              title={originalTooltip("preferredBuilding")}
              aria-expanded={editing === "preferredBuilding"}
              onClick={() => openEditor("preferredBuilding")}
            >
              Building: {facts.preferredBuilding.value ?? "Any"}
            </PillButton>
          );
        })()}

        {/* Requested Room (shown when explicitly set, e.g. via Fix It or room selection) */}
        {facts.requestedRoomId.value && (
          <PillButton
            tone={chipStyle("requestedRoomId", false).tone}
            icon={chipStyle("requestedRoomId", false).icon}
            title={originalTooltip("requestedRoomId")}
            aria-expanded={editing === "requestedRoomId"}
            onClick={() => openEditor("requestedRoomId")}
          >
            Room: {fmtFactValue("requestedRoomId", facts.requestedRoomId.value)}
          </PillButton>
        )}
      </div>

      {/* Inline Editor */}
      {editing && (
        <div
          ref={editorRef}
          role="region"
          aria-label={`Edit ${editing === "when" ? "Date and time" : FACT_LABEL[editing as FactField]}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(null);
            }
          }}
          className="gs-rise flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-subtle px-4 py-3 text-sm"
        >
          {editing === "headcount" && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseInt(headcountDraft, 10);
                onEdit("headcount", Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                setEditing(null);
              }}
            >
              <label htmlFor="chip-headcount" className="font-medium text-ink-2">
                Attendees
              </label>
              <Input
                id="chip-headcount"
                type="number"
                min={1}
                max={1000}
                value={headcountDraft}
                onChange={(e) => setHeadcountDraft(e.target.value)}
                className="w-28"
              />
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </form>
          )}

          {editing === "when" && (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (dateDraft !== (facts.date.value ?? "")) onEdit("date", dateDraft || null);
                if (startDraft !== (facts.startTime.value ?? "")) onEdit("startTime", startDraft || null);
                if (endDraft !== (facts.endTime.value ?? "")) onEdit("endTime", endDraft || null);
                setEditing(null);
              }}
            >
              <label htmlFor="chip-date" className="font-medium text-ink-2">
                Date
              </label>
              <Input
                id="chip-date"
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                className="w-40"
              />
              <label htmlFor="chip-start" className="font-medium text-ink-2">
                Starts
              </label>
              <Input
                id="chip-start"
                type="time"
                value={startDraft}
                onChange={(e) => setStartDraft(e.target.value)}
                className="w-32"
              />
              <label htmlFor="chip-end" className="font-medium text-ink-2">
                Ends
              </label>
              <Input
                id="chip-end"
                type="time"
                value={endDraft}
                onChange={(e) => setEndDraft(e.target.value)}
                className="w-32"
              />
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </form>
          )}

          {TRI_FIELDS.includes(editing as FactField) && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-ink-2">{FACT_LABEL[editing as FactField]}</span>
              <TriToggle
                label={FACT_LABEL[editing as FactField]}
                value={facts[editing as FactField].value as Tri}
                onChange={(v) => {
                  onEdit(editing as FactField, v as never);
                  setEditing(null);
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          )}

          {editing === "avNeeds" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink-2">Equipment</span>
              <div className="flex flex-wrap gap-1.5">
                {ALL_AV.map((item) => {
                  const active = facts.avNeeds.value.includes(item);
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
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                Done
              </Button>
            </div>
          )}

          {editing === "preferredBuilding" && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="chip-building" className="font-medium text-ink-2">
                Preferred building
              </label>
              <Select
                id="chip-building"
                value={facts.preferredBuilding.value ?? ""}
                onChange={(e) => {
                  onEdit("preferredBuilding", e.target.value || null);
                  setEditing(null);
                }}
                className="w-64"
              >
                <option value="">Any building</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          )}

          {editing === "requestedRoomId" && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="chip-room" className="font-medium text-ink-2">
                Requested room
              </label>
              <Select
                id="chip-room"
                value={facts.requestedRoomId.value ?? ""}
                onChange={(e) => {
                  onEdit("requestedRoomId", e.target.value || null);
                  setEditing(null);
                }}
                className="w-64"
              >
                <option value="">Best available room</option>
                {ROOMS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

