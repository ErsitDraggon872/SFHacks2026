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
7. Afterwards: help integrate, write `README.md` (including the responsible-AI section and the disclaimer).

