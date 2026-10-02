# Plan: GatorSpace — AI Event Compliance & Room Triage for SFSU

> **GatorSpace turns an event description into an explainable, policy-checked booking decision. Routine requests are approved automatically, and risky ones go to staff with the paperwork already done.**
> Core principle: **the AI interprets intent; deterministic code enforces policy.** Gemini never runs after the point where authorization is decided.

## Context
SFHacks 2026, "Build For SFSU" track. Student-org bookings take 7–10 days because SA&E staff manually read every event description to check food (EHS permit), amplified sound (quiet hours), non-SFSU guests (safety review), and headcount vs. fire rating. We automate that clerical triage. Repo is empty (README only), so this is greenfield. Auth/SSO is out of scope: a mock "Acting as: [Club ▾]" switcher stands in for verified-org accounts, and Shibboleth SSO is on the roadmap.

**Hero demo (polish this above all else):** "45 people, ACM coding night, Thursday 6–9pm in Thornton, pizza, need a projector." The AI extracts the event. FOOD-01 flags that this Thornton room doesn't allow food → Tier 2: "Everything else works. Move to CCSC Room X" → one-click **Fix It** → checklist turns green → permit draft appears → Book. The demo shows the problem being *resolved*, not just detected.

## Stack
- Next.js (App Router) + TypeScript + Tailwind + lucide-react, one Node process.
- **File-backed JSON store** (`lib/db.ts` → `data/runtime/bookings.json`) instead of `better-sqlite3`, which avoids native build failures on Windows. Reads and writes are synchronous in one Node process, so `createBooking()` runs as one uninterrupted block: read → validate → append → write. The daily cap is `bookings.filter(club, date).reduce(sum durationMin)`, the JS version of `SUM(duration)`. `npm run demo:reset` copies `bookings.seed.json` → runtime. We demo locally or on a persistent host. Not Vercel serverless.
- **Split models** behind `lib/llm.ts` (provider-swappable), each set by env var:
  - Extractor: `gemini-2.5-flash-lite` with a JSON response schema (`GEMINI_EXTRACTOR_MODEL`). It's fast and cheap, and the work is pure structured parsing.
  - Writer: `gemini-2.5-flash` for the Tier 2 explanation, the permit draft, and the Tier 3 SA&E briefing (`GEMINI_WRITER_MODEL`), because it writes cleaner admin prose. If it errors, it falls back to flash-lite and then to the demo cache.
  - `GEMINI_API_KEY` goes in `.env.local`.
- `chrono-node` for deterministic date parsing. vitest for the deterministic core.
- **Isomorphic core.** `policy.ts`, `rank.ts`, and `normalize.ts` are pure functions with no Node APIs. They import `rooms.json`/`policy.json` statically, so they run in the browser as well as on the server.

## Pipeline & types (`lib/types.ts`)
```
User text → [LLM Extractor] → EventDraft → human correction → EventFacts
  → [Policy Engine] → PolicyDecision (eventFlags + per-room results + tier)
  → [Room Ranker] (orders eligible rooms only)
  → T2/T3: [LLM Writer] explains → DecisionSnapshot
```
- **Two entry paths into the same engine:**
  1. **Quick Filters (no AI, instant):** structured controls for date, start/end, headcount, AV, food yes/no, amplified sound, outside guests. They build `EventFacts` directly (`source: "user"`), and policy + ranking run client-side immediately. This is the fast deterministic path and the always-works fallback.
  2. **Describe your event (AI):** natural language → extractor → the same `EventFacts` → the same engine. The AI's value is in catching what filters don't ask about (food → permit, a "DJ" → amplified sound, "speaker from Google" → external guest), plus the Tier 2/3 writing.
- **Tri-state facts.** Each policy-sensitive field is `true | false | null`, and `null` means unknown. Every field is `{ value, source: "ai" | "user" | "default" }`, so chip edits are recorded as user corrections and the AI output is never silently overwritten.
- **Contextual defaults, so Tier 1 is reachable.** Low-signal fields (alcohol, minors) default to `false` with `source: "default"` when they're unmentioned, and so do amplifiedSound/externalGuests for small events (≤25 people, no event-type cue like "dinner," "networking," "concert," or "speaker"). Default chips are visibly labeled ("assumed: no alcohol"). Tier 1 auto-approval also needs one officer attestation checkbox ("I confirm: no alcohol, no minors, no outside guests, no amplified sound"), which is the positive-evidence step. Fields that stay `null` (food on a dinner event, guests at a networking event) still block Tier 1 and raise a clarifying question.
- **EventDraft** has headcount, date, startTime, endTime (timezone America/Los_Angeles), food, amplifiedSound, externalGuests, guestSpeakers, alcohol, minors, avNeeds[], layout, roomTypeHints[], `missingRequiredFields[]`, and `ambiguities[]` (clarifying questions). There's no LLM self-confidence score.
- **Date/time normalization in code** (`lib/normalize.ts`): the extractor returns the raw phrase (`"Thursday 6–9pm"`), and `chrono-node` resolves it against a fixed **demo anchor** (`DEMO_ANCHOR_DATE` env, default `2026-10-05`, a Monday) with `forwardDate: true`. So "Thursday" always means 2026-10-08, and seed bookings are written against the same anchor week. Code then checks end > start, 0 < duration ≤ 6h, and that the time falls within building hours. An unparseable or ambiguous phrase goes into `ambiguities` and is never guessed.
- **PolicyDecision** is the *single canonical decision object*. Nothing else decides the tier, and the UI only renders it:
  ```ts
  { tier: 1|2|3; canAutoApprove; eventFlags: PolicyFlag[];          // event-level (alcohol, guests, >100)
    rooms: { roomId; eligible; conflicts: PolicyFlag[]; score: ScoreBreakdown }[];  // room-level (food, fire cap, sound near residence)
    permitsRequired: PermitRequirement[]; applicableRules: PolicyRuleResult[]; unresolved: string[] }
  ```
  Event risk is kept separate from room compatibility, so "use a different room" is never reported as "your event is noncompliant."
- **Tier 1 requires positive evidence.** That means no hard blocks, no escalations, no permits, no unresolved safety fields (any `null` → no auto-approve), defaults attested by the officer, an eligible room exists, and the cap and conflict checks pass. Tier 2 means there are fixable room conflicts or permits are needed. Tier 3 means some escalation effect fired. A Tier 3 result has no Fix It.

## Data (`/data`)
- `policy.json`: about 12 rules, each `{ id, title, excerpt, effect: "BLOCK_ROOM"|"REQUIRE_PERMIT"|"WARN"|"ESCALATE", scope: "event"|"room" }`. Condition logic lives in TypeScript (`lib/policy.ts`, one evaluator per rule id). The JSON metadata is what backs the claim that SA&E can change policy without touching the AI. Example rules: CAP-01 fire cap, FOOD-01 no-food rooms, FOOD-02 EHS permit, SOUND-01 9pm curfew, SOUND-02 residence proximity, GUEST-01 external guests, SIZE-02 >100, ALC-01 alcohol, HOURS-01 building hours, CAP-DAILY-01 3-hr cap.
- `rooms.json`: 12–15 rooms (Thornton, HSS, Burk, CCSC, Library, Business, Fine Arts). Each has fireCapacity, seats, av[], layout, foodAllowed, nearResidence, adaAccessible, type, and hours.
- `clubs.json` (5 clubs) and `bookings.seed.json` (pre-loaded so conflicts and the cap show up in the demo).
- `demo-cache.json`: the **full** cached result for each preset: input, extraction, writer output, and expectedTier. The deterministic engine still runs live on cached extractions. A small unobtrusive badge shows `AI: Live` or `AI: Demo fallback`.

## Ranking (`lib/rank.ts`)
Ranking is lexicographic, with no magic weights: (1) eligible, (2) meets all requested AV, (3) layout match, (4) smallest adequate capacity, (5) optional preferences (ADA, building hint). Each room returns a `ScoreBreakdown` with reasons, e.g. "Seats 48 for 40 attendees · food permitted · projector · classroom layout."

## Booking (`lib/booking.ts → createBooking()`)
This is the one authoritative function, server-side only, and it runs as one synchronous read-validate-write block on the JSON store. It runs the daily cap sum check (≤180 min per club per day), checks for room overlap, and re-runs the room/policy rules on the submitted facts. Then it inserts. The triage result is advisory only, and everything is revalidated at commit time.

## UI
- Global banner: "Prototype: policy rules and room data are illustrative, modeled on SFSU workflows, not authoritative university policy." The same notice goes in the README.
- `/` Request page:
  - NL textarea and 4 presets: Tier 1 study group, **Tier 2 pizza coding night (hero)**, Tier 3 150-person guest speaker, late-night dance (sound curfew).
  - Editable fact chips. AI values and user-corrected values look different, and an edit re-runs `policy.ts` + `rank.ts` **client-side** with no API roundtrip. It uses the room-availability snapshot returned with the triage response, and the server still revalidates at booking.
  - A Quick Filters panel (tab next to "Describe your event") feeds the same engine directly.
  - A clarifying-question card for `null` / ambiguous fields ("Will anyone attending be unaffiliated with SFSU?").
  - Tier badge.
  - Compliance checklist with a citation on every row ("✓ CAP-01 · 45 ≤ 52 fire capacity"). Clicking a citation opens the policy excerpt.
  - Ranked room cards with a "Why #1" line. Ineligible rooms are grayed out with their conflict.
  - Tier 2: Fix It + permit draft. Tier 3: a distinct "Staff review required" panel listing what GatorSpace prepared.
  - Quota meter: "2.0 / 3.0 hrs today."
- `/admin` SA&E queue:
  - Tier 3 briefings with approve/deny.
  - A decision-snapshot log: requestText, extractedEvent, userCorrections, matchedRules, selectedRoom, tier, generatedBrief, timestamp. No model reasoning text is stored.
  - Counts: "12 auto-approved · 4 permit-assisted · 2 escalated."
  - "Estimated manual review avoided: N requests × assumed 15 min ≈ X hrs," with the assumption labeled.

## Visual direction (revision: Devin-style, clean & mostly white)
Reference is devin.ai: white background, near-black text, large tight sans headline, black pill primary button + outlined secondary, hairline gray borders, generous whitespace, small muted helper text. No gradients and no heavy color.
- **Tokens:** `bg-white`, text `neutral-950` / muted `neutral-500`, borders `neutral-200`, primary button `bg-neutral-950 text-white rounded-full`. Font is Geist (already in the scaffold). SFSU purple `#463077` is used **only** as a small accent (logo mark, focus ring, selected tab underline). Status colors are muted green/amber/red, always paired with an icon.
- **Single centered column** (`max-w-3xl mx-auto`), with one thing to look at at a time.
- **Top bar** (thin bottom border): `GatorSpace` wordmark on the left. On the right, the club switcher, quota pill ("2.0 / 3.0 hrs"), and an "Admin" link. The illustrative-policy disclaimer is one small muted line under the top bar.
- **Empty state (hero):** headline "Book a room for your event." plus a one-line muted subhead. Below that is a **big centered search box**, which is the focal point: rounded-2xl, border, subtle shadow, a multiline textarea that grows, and a black "Find rooms →" button inside it. A small `Describe | Filters` segmented toggle sits above the box, and the 4 presets are gray pills below it.
- **Results state:** the search box animates up to the top (stays editable), and below it, in order:
  1. **"Understood" chip row**: AI / edited / assumed styles, click a chip to edit.
  2. A **one-line tier banner** with an icon, e.g. "⚠ Needs one change: food isn't allowed in Thornton 326," plus a Fix It button.
  3. **Ranked list**: #1 is a larger card ("Best match," "Why #1" reasons, Book button, collapsible compliance checklist with rule-id citations). #2–#5 are compact rows (name · building · capacity · one-line why · Book). Ineligible rooms are folded into a "3 rooms unavailable — show why" disclosure.
  4. Permit draft (T2) or "Staff review required" panel (T3), placed below the list.
- `/admin` uses the same language: a white table-like list with hairline dividers and a muted metadata row.

## Key files
```
lib/types.ts normalize.ts policy.ts rank.ts booking.ts db.ts llm.ts snapshot.ts
app/page.tsx  app/admin/page.tsx
app/api/triage/route.ts      # extract (or cache) → normalize → policy → rank → writer (T2/T3)
app/api/availability/route.ts # bookings for a date (feeds client-side engine)
app/api/bookings/route.ts    # createBooking()
app/api/admin/route.ts
components/FactChips ComplianceChecklist RoomCard TierPanel PermitDraft QuotaMeter ClubSwitcher PolicyBanner
data/*.json  scripts/demo-reset.ts  tests/policy.test.ts booking.test.ts
```

## Responsible AI
Hard rules are deterministic. Auto-approval requires every safety field to be resolved, and unknown is never treated as no. Tier 3 always goes to a human. Every decision is captured as a reversible snapshot that shows the AI's values next to the user's corrections. Only the event description goes to the LLM: no names or IDs, and no club name, which reduces bias. In production we'd use a university-contracted, no-training LLM. The writer receives only structured fields, its output is display-only, and any rule IDs it cites that don't exist are stripped. Accessibility: keyboard navigation, ARIA labels, icon plus color on badges, and an ADA room attribute. Adoption path: Shibboleth SSO, room sync from the 25Live/EMS API, and a policy editor for SA&E (roadmap only, not built).

## Scope protection
Protected: extraction, human correction, deterministic rules, explainable ranking, Tier 2 resolution, Tier 3 handoff, cap/conflict enforcement, demo fallback. **Cut:** no-show auto-release and the policy admin editor (roadmap only).

## Timeline (deterministic demo before the live model)
| Time | Work |
|---|---|
| 0–45m | Scaffold, types, seed JSON, policy.json |
| 45–90m | Policy engine, ranking, JSON store + createBooking, unit tests, Quick Filters wired to the engine |
| 90–150m | Presets + demo-cache driving `/api/triage` (no Gemini yet) |
| 150–210m | Full Tier 2 hero flow end-to-end in the UI |
| 210–255m | Gemini extractor + writer behind `lib/llm.ts` |
| 255–300m | Tier 3 panel + `/admin` queue + snapshots |
| 300–330m | Failure modes, `demo:reset`, test pass |
| 330–360m | Visual polish, README, pitch rehearsal |

## Team split (3 machines)
**First step after approval (this machine is Computer 1):** commit this plan as `docs/PLAN.md` and the three handoffs below as `docs/handoff-1-engine.md`, `docs/handoff-2-frontend.md`, `docs/handoff-3-ai-admin.md`. Each teammate pastes their handoff into their own agent. Every handoff starts with "Read `docs/PLAN.md` first."

**Next steps on C1 after this revision (foundation first, so C2 and C3 are never blocked):**
- (a) Re-sync `docs/PLAN.md` + regenerate the handoffs on PR #1.
- (b) Contract: `lib/types.ts` with all types, engine stubs, seed data, and all 5 fixtures.
- (c) Frontend foundation: tokens, primitives, shell (TopBar, SearchHero, ResultsList), page state machine + `triageClient`, mounted typed stubs, the `/dev` gallery, and `docs/frontend-guide.md`.
- (d) For C3: API route stubs returning fixtures with the contract shapes, so `/api/triage` works on day one and C3 replaces the internals. Ownership of `app/api/**` passes to C3 once the stubs are merged. `lib/client/*` and `app/dev/*` stay with C1.
- (e) Typecheck + `next build` green, merge to `main`, tell the team.
- (f) Then the engine + tests.

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

### Handoff 2: Computer 2 (Gemini) — Frontend Components & Hero Demo Lead
**Owns:** the component list under **C2 owns** above. Don't restyle the shell or primitives. If you need a primitive, ask C1 to add it.
1. Read **Visual direction** and `docs/frontend-guide.md`. C1 has already built the shell, primitives, and page wiring, with your components mounted as typed placeholder stubs. Follow **C2's execution path** above.
2. Build against `fixtures/*.json` (`/dev` gallery and `/?fixture=pizza`), then set `NEXT_PUBLIC_USE_FIXTURES=0` once C3's API is live.
3. What your components must show: illustrative-policy banner, club switcher + quota meter ("2.0 / 3.0 hrs today"), tabs [Describe your event | Quick Filters], 4 preset buttons (Study Group T1, **Pizza Night (Hero) T2**, 150-Guest Speaker T3, Late Dance), fact chips (AI / user-corrected / assumed-default each styled differently, editable), clarifying-question card, compliance checklist (✓/⚠/⛔ + clickable rule-id excerpt), ranked room cards ("Why #1", ineligible rooms grayed out with reason), and the tier panel.
4. **Client-side re-evaluation:** a chip edit or Quick Filter change calls `evaluate()` + `rankRooms()` from `lib/` directly, using `bookingsForDate`. There's no API call.
5. TierPanel: T1 attestation checkbox → Book. T2 **Fix It: Switch to <room>** → checklist turns green → PermitDraft → Book. T3 is a distinct "Staff review required" panel listing what was prepared, with no Fix It.
6. Accessibility: keyboard navigable, ARIA labels, icon + color on every status. Mobile-friendly.
7. **Done =** the hero pizza flow works end-to-end with zero console errors.

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

## Pitch (centerpiece)
One line: **"The AI interprets intent; deterministic code enforces policy."** The 3-minute arc: (1) the 7–10 day SA&E bottleneck, (2) hero Tier 2 pizza demo live, (3) Tier 3 → `/admin` briefing, so staff are supported and not replaced, (4) architecture diagram showing Gemini only before the decision boundary, (5) responsible AI: unknown ≠ false, positive-evidence Tier 1, recheck at commit time, audit snapshots, (6) SFSU adoption path.

## Requirements checklist (each revision → where it lives)
| # | Requirement | Plan location |
|---|---|---|
| 1 | One canonical `PolicyDecision`; only `policy.ts` decides tier/approval | `lib/policy.ts` returns it; rank/writer/UI only consume it |
| 2 | Event risk kept separate from room conflicts | `PolicyDecision.eventFlags` vs `rooms[].conflicts`; rule `scope` |
| 3 | Rule effects BLOCK_ROOM / REQUIRE_PERMIT / WARN / ESCALATE | `policy.json` `effect` field |
| 4 | Tri-state `true\|false\|null` safety fields | `EventDraft` in `lib/types.ts` |
| 5 | No LLM confidence score; missing fields + ambiguities instead | `missingRequiredFields[]`, `ambiguities[]` → clarifying-question card |
| 6 | Tier 1 = all fields resolved + no flags + eligible room + no overlap + cap pass | Tier derivation in `policy.ts`; unit-tested |
| 7 | Capacity, overlap, and 3-hr cap rechecked at booking | `createBooking()` synchronous read-validate-write |
| 8 | Local/demo-friendly store + `npm run demo:reset` | File-backed JSON store (no native build); `scripts/demo-reset.ts` |
| 21 | Split models: 2.5 Flash-Lite extractor, 2.5 Flash writer | Stack section; `lib/llm.ts` env-configurable |
| 22 | Contextual defaults so Tier 1 is reachable | `source: "default"` + attestation checkbox |
| 23 | Demo date anchor | `normalize.ts` + chrono-node + `DEMO_ANCHOR_DATE` |
| 24 | Client-side re-evaluation on chip edits | Isomorphic `policy.ts`/`rank.ts` |
| 25 | Deterministic filter path (no NLP) | Quick Filters → same engine |
| 9 | Cache extractor and writer outputs for presets | `data/demo-cache.json` + Live/Fallback badge |
| 10 | Explainable ranking with "why this room" reasons | Lexicographic `rank.ts` + `ScoreBreakdown.reasons` |
| 11 | Track whether each fact came from the AI or a user correction | `{ value, source }` on every fact; chips visually distinct |
| 12 | Structured decision snapshot for audit | `lib/snapshot.ts`; `/admin` log |
| 13 | Tier 2 pizza flow is the main demo | Hero demo section; built first in the timeline (150–210m) |
| 14 | Tier 3 visibly different, no Fix It | `TierPanel` "Staff review required"; `/admin` briefing |
| 15 | "Time saved" labeled as an estimate | `/admin` counts + assumption-labeled estimate |
| 16 | Rule IDs/citations in the checklist | `ComplianceChecklist` rows + clickable excerpts |
| 17 | Illustrative-policy disclaimer | `PolicyBanner` + README |
| 18 | No-show feature cut | Scope protection section |
| 19 | Deterministic demo before Gemini | Timeline: Gemini at 210m, after the cache-driven flow works |
| 20 | Pitch centered on "AI interprets intent; code enforces policy" | Header + Pitch section |

## Verification
- `npm test`: policy tests (each rule, tri-state null blocks Tier 1, event vs. room flag separation, tier derivation) and booking tests (cap rejects the 181st minute, overlap rejected, revalidation catches a room booked after triage).
- `npm run dev`, then run each preset. Study → T1 auto-approved. Pizza → T2, Fix It moves to CCSC and the checklist turns green, then book. 150 + speaker → T3, no Fix It, appears in `/admin`. Late dance → SOUND-01 flag.
- Edit the headcount chip from 45 → 60. It's marked user-corrected, the engine re-runs, and the change shows up in the snapshot.
- Free text "networking dinner for 80" → externalGuests/alcohol unknown → clarifying questions, no auto-approve.
- Book 3 hrs as one club, then try another → cap rejection. Switch club → allowed.
- Small study group via free text → defaults labeled "assumed" → tick attestation → Tier 1 auto-approved.
- "Thursday 6–9pm" resolves to 2026-10-08 18:00–21:00 (unit test in `normalize.test.ts`).
- Quick Filters with the same facts as the pizza preset produce the identical `PolicyDecision`.
- Unset `GEMINI_API_KEY` → presets still work fully, and the badge shows Demo fallback.
- `npm run demo:reset` restores the seed state.
