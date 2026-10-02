# Handoff 3 — Computer 3 (Gemini): AI Specialist & Admin Portal Lead

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

### Handoff 3: Computer 3 (Gemini) — AI Specialist & Admin Portal Lead
**Owns:** `lib/llm.ts`, `lib/snapshot.ts`, `app/api/**`, `app/admin/page.tsx`, `data/demo-cache.json`, `scripts/demo-reset.ts`, `.env.example`.
1. `llm.ts` with `@google/genai`:
   - Extractor `gemini-2.5-flash-lite` with a strict `responseSchema` matching `EventDraft` (tri-state nulls, raw time phrase, `missingRequiredFields`, `ambiguities`). The prompt says never invent values and use null when unmentioned. Only event text is sent: no names, no club.
   - Writer `gemini-2.5-flash` receives only structured facts + decision + cited rule excerpts. Rule IDs not in `policy.json` get stripped.
   - Fallback chain: Flash → Flash-Lite → `demo-cache.json`. Models are configured via `GEMINI_EXTRACTOR_MODEL` / `GEMINI_WRITER_MODEL`.
2. `demo-cache.json`: full extractor + writer outputs for all 4 presets. `presetId` requests use the cache when there's no key or the API errors, and `aiMode` reports `"live"` or `"fallback"`.
3. API routes per the contract. `/api/triage` runs extract → `draftToFacts` → `evaluate` → `rankRooms` → writer (T2/T3 only). `/api/bookings` calls `createBooking` and saves a `DecisionSnapshot`.
4. `snapshot.ts`: DecisionSnapshot = requestText, draft, userCorrections, matchedRules, selectedRoom, tier, writer output, timestamp. No model reasoning text is stored.
5. `/admin`: pending Tier 3 briefings with Approve/Deny, the snapshot audit log (AI value vs user correction diff), counts ("N auto-approved · N permit-assisted · N escalated"), and "Estimated review avoided: N × assumed 15 min."
6. `npm run demo:reset`: restores bookings + snapshots from seed.
7. **Done =** all 4 presets work with the key unset, and live free text "networking dinner for 80" returns clarifying questions.

> Note: C1 merges working stub routes in `app/api/**` that return fixtures in the contract shapes. Replace their internals; keep the request/response shapes.
