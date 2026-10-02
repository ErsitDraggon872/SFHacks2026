# Handoff 1 — Computer 1 (Claude Opus): Engine & Architecture Lead

> **Read `docs/PLAN.md` first.** It is the full spec. This file is your slice. Pull `main` before starting.


### Shared rules (included in every handoff)
- **File ownership is strict.** Only edit files you own. If you need a change in someone else's file, ask that owner.
- **Contract = `lib/types.ts`.** It's owned by C1 and frozen at T+15m. Any change after that gets announced to the team.
- **Git:** each machine works on its own branch (`engine`, `frontend`, `ai-admin`), rebases on `main`, and merges small PRs to `main` often. Never force-push `main`.
- **Sync points:** T+15m contract + scaffold on main · T+90m engine + tests green · T+150m hero Tier 2 flow working from the cache · T+210m live Gemini · T+300m feature freeze.

### Integration contract (C1 writes these signatures into `lib/types.ts` / stubs at T+15m)
```ts
// lib/policy.ts (C1)
evaluate(facts: EventFacts, ctx: { rooms: Room[]; bookings: Booking[]; clubId: string; attested: boolean }): PolicyDecision
// lib/rank.ts (C1)
rankRooms(facts: EventFacts, decision: PolicyDecision, rooms: Room[]): RankedRoom[]   // RankedRoom has reasons[]
// lib/normalize.ts (C1)
resolveWhen(phrase: string, anchor?: string): { date; startTime; endTime; durationMin } | { ambiguity: string }
draftToFacts(draft: EventDraft): EventFacts           // applies contextual defaults (source:"default")
// lib/booking.ts (C1, server-only)
createBooking(req: BookingRequest): { ok: true; booking: Booking } | { ok: false; errors: PolicyFlag[] }
// lib/db.ts (C1, server-only): readCollection<T>(name) / writeCollection<T>(name, rows) over data/runtime/*.json
// lib/llm.ts (C3)
extractEvent(text: string): Promise<{ draft: EventDraft; aiMode: "live" | "fallback" }>
writeExplanation(facts: EventFacts, decision: PolicyDecision): Promise<WriterOutput>   // T2 explanation + permit draft | T3 briefing
// HTTP (C3)
POST /api/triage    { text } | { presetId } , clubId  → TriageResponse { draft, facts, decision, ranked, writer, bookingsForDate, aiMode }
GET  /api/availability?date=  → Booking[]
POST /api/bookings  BookingRequest → createBooking result (snapshot saved)
GET  /api/admin     → { pending: DecisionSnapshot[]; log: DecisionSnapshot[]; counts }
POST /api/admin     { snapshotId, action: "approve" | "deny" }
```
At T+15m, C1 also commits `fixtures/triage-{study,pizza,speaker,dance}.json`, which are hand-written sample `TriageResponse`s. C2 builds the UI against them before the APIs exist.

### Handoff 1: Computer 1 (Claude Opus) — Engine & Architecture Lead
**Owns:** the Next.js scaffold (`create-next-app` + Tailwind + lucide-react + vitest + chrono-node), `lib/types.ts`, `lib/policy.ts`, `lib/rank.ts`, `lib/normalize.ts`, `lib/db.ts`, `lib/booking.ts`, `data/{policy,rooms,clubs,bookings.seed}.json`, `fixtures/*`, `tests/*`.
1. **T+0–15m:** scaffold, `types.ts` with full types + the contract signatures (stubs that throw), seed JSON, fixtures. Push to `main` and tell the team.
2. `policy.ts`: about 12 rule evaluators keyed by rule id, with effects from `policy.json`. Event flags stay separate from room conflicts. Tri-state handling, where any `null` safety field or missing attestation means no Tier 1. Tier derivation lives only here.
3. `rank.ts`: lexicographic ranking with `reasons[]`.
4. `normalize.ts`: chrono-node pinned to `DEMO_ANCHOR_DATE=2026-10-05` (forwardDate), validation, and contextual defaults.
5. `db.ts` + `booking.ts`: synchronous read-validate-write. It rechecks overlap, the fire cap, room rules, and the ≤180 min/club/day cap.
6. vitest: one test per rule, tri-state null blocks Tier 1, event vs room separation, tier matrix, cap rejects the 181st minute, overlap, booking-time revalidation, "Thursday 6–9pm" → 2026-10-08 18:00–21:00. **Done =** `npm test` green and all 4 fixtures reproduce from `evaluate()`.
7. **Frontend shell** (right after step 1, before steps 2–6): the files listed under "C1 owns" in Frontend split, built per Visual direction and pushed to `main` so C2 can slot components in.
8. Afterwards: help integrate, write `README.md` (including the responsible-AI section and the disclaimer).

### Frontend split (revision)
**C1 builds the shell + design system first** (after the T+15m contract push, about 45 min). That way the look stays consistent, and C2 fills it in.
- **C1 owns:** `app/layout.tsx`, `app/globals.css` (tokens), `app/page.tsx` (page state machine: empty hero → results, layout slots), `components/ui/*` (Button, Pill, Card, Segmented, Disclosure, StatusIcon primitives), `components/TopBar.tsx`, `components/SearchHero.tsx` (centered box + presets + Describe/Filters toggle), `components/ResultsList.tsx` (#1 card + compact rows + unavailable disclosure, rendering `RankedRoom[]` from fixtures).
- **C2 owns** the detailed components that slot into the shell, built only from `components/ui/*` primitives: FactChips, ComplianceChecklist, RoomCard detail (Why #1 + Book), TierPanel (T1 attestation / T2 Fix It / T3 staff review), PermitDraft, QuickFilters, ClubSwitcher, QuotaMeter, AiModeBadge, PolicyBanner. C2 also wires client-side re-evaluation and the booking flow.
- Until the C1 shell lands, C2 builds its components in isolation against `fixtures/*.json`.

### Frontend foundation C1 delivers, so C2 only fills in component bodies

> **Status: delivered.** The final prop signatures are in `docs/frontend-guide.md` and in each component file. They supersede the sketch below (e.g. `RoomCard` takes `variant` + `onSelect`, and `TierPanel` takes `onSubmit` + `result`).
1. **Typed component stubs, already mounted.** Every C2 component exists as a file with its final props interface, a JSDoc comment saying exactly what it renders and which interactions it has, and a placeholder body (`<Placeholder name="FactChips" />`, a dashed gray box). Each stub is already imported and placed in the right slot in `app/page.tsx`, with props passed from page state. C2 never edits the page or the wiring, only the component bodies.
   ```ts
   FactChips({ facts, draft, onEdit(field, value) })
   ClarifyingQuestions({ questions, onAnswer(field, value) })
   TierPanel({ decision, topRoom, fixRoom, attested, onAttest, onFix, onBook })
   ComplianceChecklist({ results: PolicyRuleResult[], onCite(ruleId) })
   RoomCard({ ranked: RankedRoom, rank, onBook })   // #1 large variant via rank===1
   PermitDraft({ permit: PermitRequirement, writer })
   QuickFilters({ value: EventFacts, onChange })
   ClubSwitcher({ clubs, clubId, onChange }) · QuotaMeter({ usedMin, capMin }) · AiModeBadge({ mode }) · PolicyExcerptModal({ ruleId, onClose })
   ```
2. **Page state machine already working** (`app/page.tsx`, a client component): `idle → loading → results`. Results are loaded from `fixtures/` through `lib/client/triageClient.ts`. Its `triage()` function reads the fixture when `?fixture=` is present or when `NEXT_PUBLIC_USE_FIXTURES=1`, and otherwise calls `POST /api/triage`, so switching to the real API is just a flag. Handlers (`onEdit`, `onFix`, `onBook`, `onAttest`) are implemented in the page against the engine stubs.
3. **UI primitives** in `components/ui/`: Button (primary/secondary/ghost), Pill, Card, Segmented, Disclosure, StatusIcon (pass/warn/block/escalate → icon + color + aria-label), Field, Modal, Placeholder. All are styled with the tokens, and C2 composes only from these.
4. **Component gallery** at `/dev`: renders every component × each of the 4 fixtures side by side, so C2 can work on one component at a time without clicking through the flow.
5. **`docs/frontend-guide.md`** covers:
   - tokens and do/don't
   - the primitives API
   - the prop contract table above
   - how to run against fixtures (`npm run dev` → `/?fixture=pizza`, `/dev`)
   - a per-component **acceptance checklist** (e.g. TierPanel T2 shows Fix It naming the room; T3 has no Fix It; T1 Book is disabled until attested)
   - the hero-flow click script C2 must make pass
6. **Fixtures cover every UI state:** study (T1 with defaults), pizza (T2 with FOOD-01 + permit), speaker (T3), dance (SOUND-01 + unavailable rooms), plus `pizza-fixed` (the state after Fix It), so the UI can be built before the engine exists.

**C2's execution path:** pull `main` → open `/dev` → replace each placeholder body in the order FactChips → TierPanel → RoomCard → ComplianceChecklist → PermitDraft → rest → tick each acceptance checklist → run the hero click script on `/?fixture=pizza` → flip `NEXT_PUBLIC_USE_FIXTURES=0` once C3's API is live.
