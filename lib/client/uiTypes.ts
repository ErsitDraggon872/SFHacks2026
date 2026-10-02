/** Prop types shared between the page (C1) and components (C2). OWNER: C1. */
import type { EventFacts, FactField } from "@/lib/types";

/** Set one fact as a user correction. The page re-runs the policy engine right after. */
export type EditFact = <K extends FactField>(field: K, value: EventFacts[K]["value"]) => void;
