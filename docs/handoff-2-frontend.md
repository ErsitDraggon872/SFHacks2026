# Handoff 2 — Computer 2 (Gemini): Frontend & Hero Demo Lead

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

### Handoff 2: Computer 2 (Gemini) — Frontend & Hero Demo Lead
**Owns:** `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components/*` (PolicyBanner, ClubSwitcher, QuotaMeter, QuickFilters, FactChips, ComplianceChecklist, RoomCard, TierPanel, PermitDraft, AiModeBadge).
1. Until T+15m: sketch the layout and design tokens (SFSU purple `#463077` / gold `#C99700`).
2. Build against `fixtures/*.json`, then switch to `POST /api/triage` once C3 ships it.
3. Page layout: illustrative-policy banner, club switcher + quota meter ("2.0 / 3.0 hrs today"), tabs [Describe your event | Quick Filters], 4 preset buttons (Study Group T1, **Pizza Night (Hero) T2**, 150-Guest Speaker T3, Late Dance), fact chips (AI / user-corrected / assumed-default each styled differently, editable), clarifying-question card, compliance checklist (✓/⚠/⛔ + clickable rule-id excerpt), ranked room cards ("Why #1", ineligible rooms grayed out with reason), and the tier panel.
4. **Client-side re-evaluation:** a chip edit or Quick Filter change calls `evaluate()` + `rankRooms()` from `lib/` directly, using `bookingsForDate`. There's no API call.
5. TierPanel: T1 attestation checkbox → Book. T2 **Fix It: Switch to <room>** → checklist turns green → PermitDraft → Book. T3 is a distinct "Staff review required" panel listing what was prepared, with no Fix It.
6. Accessibility: keyboard navigable, ARIA labels, icon + color on every status. Mobile-friendly.
7. **Done =** the hero pizza flow works end-to-end with zero console errors.

