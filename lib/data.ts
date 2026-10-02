/** Static reference data, typed. Isomorphic (safe to import in client components). OWNER: C1. */
import type { Club, PolicyRule, Room } from "./types";
import roomsJson from "@/data/rooms.json";
import clubsJson from "@/data/clubs.json";
import policyJson from "@/data/policy.json";

export const ROOMS = roomsJson as Room[];
export const CLUBS = clubsJson as Club[];
export const POLICY = policyJson as PolicyRule[];

export const POLICY_BY_ID: Record<string, PolicyRule> = Object.fromEntries(POLICY.map((r) => [r.id, r]));
export const ROOM_BY_ID: Record<string, Room> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const CLUB_BY_ID: Record<string, Club> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

export function getRule(id: string): PolicyRule {
  const rule = POLICY_BY_ID[id];
  if (!rule) throw new Error(`Unknown policy rule ${id}`);
  return rule;
}

/** Short, user-facing category for a rule id ("FOOD-02" → "Food"). Falls back to the raw id. */
const RULE_LABEL: Record<string, string> = {
  "CAP-01": "Capacity",
  "FOOD-01": "Food",
  "FOOD-02": "Food",
  "SOUND-01": "Sound",
  "SOUND-02": "Sound",
  "GUEST-01": "Guests",
  "GUEST-02": "Guests",
  "SIZE-01": "Event size",
  "SIZE-02": "Event size",
  "ALC-01": "Alcohol",
  "MINOR-01": "Minors",
  "WEAPON-01": "Weapons",
  "HOURS-01": "Building hours",
  "ADA-01": "Accessibility",
  "BOOK-01": "Availability",
  "CAP-DAILY-01": "Daily limit",
  "INFO-01": "Missing details",
};

export function ruleLabel(id: string): string {
  return RULE_LABEL[id] ?? id;
}
