/** Display formatters shared by all components. OWNER: C1. */
import { avLabel } from "@/lib/rank";
import { ROOM_BY_ID } from "@/lib/data";
import type { AvItem, EventFacts, FactField, HHMM, ISODate, Layout, PolicyDecision } from "@/lib/types";

/** "18:00" → "6 PM", "21:30" → "9:30 PM" */
export function fmtTime(t: HHMM | null): string {
  if (!t) return "?";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

/** "2026-10-08" → "Thu, Oct 8" (no timezone drift: parsed as a calendar date). */
export function fmtDate(d: ISODate | null): string {
  if (!d) return "?";
  const [y, mo, da] = d.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, da));
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtRange(facts: EventFacts): string {
  return `${fmtDate(facts.date.value)} · ${fmtTime(facts.startTime.value)}–${fmtTime(facts.endTime.value)}`;
}

/** 150 → "2.5 hrs" */
export function fmtMinutes(min: number): string {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`;
}

/** Short human label for each fact, used by chips and the audit log. */
export const FACT_LABEL: Record<FactField, string> = {
  summary: "Event",
  headcount: "Attendees",
  date: "Date",
  startTime: "Starts",
  endTime: "Ends",
  food: "Food",
  foodDescription: "Food served",
  amplifiedSound: "Amplified sound",
  externalGuests: "Non-SFSU guests",
  guestSpeakers: "Guest speakers",
  alcohol: "Alcohol",
  minors: "Under 18",
  weapons: "Weapons",
  avNeeds: "Equipment",
  layout: "Layout",
  preferredBuilding: "Building",
  requestedRoomId: "Room",
  adaRequired: "Accessible space",
};

const LAYOUT_LABEL: Record<Layout, string> = {
  lecture: "Lecture",
  classroom: "Classroom",
  seminar: "Seminar",
  open: "Open floor",
  lab: "Lab",
  studio: "Studio",
};

/** Value of a fact as text: tri-state → "Yes"/"No"/"Unknown", lists joined, etc. */
export function fmtFactValue(field: FactField, value: unknown): string {
  if (value === null || value === undefined) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (field) {
    case "date":
      return fmtDate(value as string);
    case "startTime":
    case "endTime":
      return fmtTime(value as string);
    case "avNeeds":
      return (value as AvItem[]).length ? (value as AvItem[]).map(avLabel).join(", ") : "None";
    case "layout":
      return LAYOUT_LABEL[value as Layout];
    case "requestedRoomId":
      return ROOM_BY_ID[value as string]?.name ?? String(value);
    default:
      return String(value);
  }
}

export type BookedRoom = { roomId: string; name: string; time: string | null };

/**
 * Rooms that would fit but are taken at this time. The target is left out: when it is booked,
 * decision.headline already says so. Times come from the BOOK-01 message ("Already booked 19:00–20:30").
 */
export function bookedElsewhere(decision: PolicyDecision): BookedRoom[] {
  return decision.rooms
    .filter((r) => r.roomId !== decision.targetRoomId && r.conflicts.length > 0 && r.conflicts.every((c) => c.ruleId === "BOOK-01"))
    .map((r) => {
      const m = r.conflicts[0].message.match(/(\d{2}:\d{2})–(\d{2}:\d{2})/);
      return { roomId: r.roomId, name: ROOM_BY_ID[r.roomId]?.name ?? r.roomId, time: m ? `${fmtTime(m[1])}–${fmtTime(m[2])}` : null };
    });
}

/** "Gymnasium 129 (7 PM–8:30 PM) is already booked at this time." */
export function bookedSentence(rooms: BookedRoom[]): string {
  const list = rooms.map((r) => (r.time ? `${r.name} (${r.time})` : r.name)).join(", ");
  return `${list} ${rooms.length === 1 ? "is" : "are"} already booked at this time.`;
}

/** Case-insensitive: the writer may say "gymnasium 129". */
export function mentionsRoom(text: string | null | undefined, name: string): boolean {
  return !!text && text.toLowerCase().includes(name.toLowerCase());
}
