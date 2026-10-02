/** Demo preset scenarios (text shown in the UI + expected tier). OWNER: C1. */
import type { PresetId } from "./types";

export interface Preset {
  id: PresetId;
  label: string;
  text: string;
  clubId: string;
  expectedTier: 1 | 2 | 3;
}

export const PRESETS: Preset[] = [
  {
    id: "study",
    label: "Study group",
    text: "Study group for 8 people on Wednesday 4-6pm, we just need a whiteboard. Library if possible.",
    clubId: "study",
    expectedTier: 1,
  },
  {
    id: "pizza",
    label: "Pizza coding night",
    text: "ACM coding night for 45 members Thursday 6-9pm in Thornton. We'll have pizza and need a projector.",
    clubId: "acm",
    expectedTier: 2,
  },
  {
    id: "speaker",
    label: "150-person speaker panel",
    text: "Pre-Med Society panel with 150 attendees and two guest speakers from UCSF, Tuesday 5-7pm. We need mics and a projector.",
    clubId: "premed",
    expectedTier: 3,
  },
  {
    id: "dance",
    label: "Late-night dance practice",
    text: "Dance practice for 25 of our members Thursday 9:30-11pm at the Village community room, we'll bring a speaker for music.",
    clubId: "dance",
    expectedTier: 2,
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p])) as Record<PresetId, Preset>;
