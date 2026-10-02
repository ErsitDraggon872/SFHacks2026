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
