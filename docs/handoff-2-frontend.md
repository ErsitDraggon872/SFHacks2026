# Handoff 2 — Computer 2 (Gemini): Frontend Components & Hero Demo Lead

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

### Frontend split (revision)
**C1 builds the shell + design system first** (after the T+15m contract push, about 45 min). That way the look stays consistent, and C2 fills it in.
- **C1 owns:** `app/layout.tsx`, `app/globals.css` (tokens), `app/page.tsx` (page state machine: empty hero → results, layout slots), `components/ui/*` (Button, Pill, Card, Segmented, Disclosure, StatusIcon primitives), `components/TopBar.tsx`, `components/SearchHero.tsx` (centered box + presets + Describe/Filters toggle), `components/ResultsList.tsx` (#1 card + compact rows + unavailable disclosure, rendering `RankedRoom[]` from fixtures).
- **C2 owns** the detailed components that slot into the shell, built only from `components/ui/*` primitives: FactChips, ComplianceChecklist, RoomCard detail (Why #1 + Book), TierPanel (T1 attestation / T2 Fix It / T3 staff review), PermitDraft, QuickFilters, ClubSwitcher, QuotaMeter, AiModeBadge, PolicyBanner. C2 also wires client-side re-evaluation and the booking flow.
- Until the C1 shell lands, C2 builds its components in isolation against `fixtures/*.json`.

### Frontend foundation C1 delivers, so C2 only fills in component bodies
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
