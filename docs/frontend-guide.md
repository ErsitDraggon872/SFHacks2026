# Frontend guide (for Computer 2)

You only edit **component bodies**. The page, wiring, state, policy engine, and primitives are already done.
Every component you own exists, is mounted in the right place in `app/page.tsx`, and receives its final props.
Each one starts as a dashed `<Placeholder>` box. The JSDoc at the top of each file is its spec.

## Run it

```bash
npm install
npm run dev
```

- **`/dev`**: gallery. Shows every component with each fixture (`study`, `pizza`, `pizza-fixed`, `speaker`, `dance`). Build here first.
- **`/?fixture=pizza`**: the real page loaded straight into a results state. Also works for `study`, `speaker`, `dance`, and `pizza-fixed`.
- **`/`**: the real flow. Presets go through `/api/triage` (served from the demo cache). Free text returns "not connected yet" until C3 ships Gemini.
- `npm run demo:reset` restores bookings and clears snapshots.

## Rules

1. **Never compute tier, eligibility, or approval in a component.** Render `decision` (a `PolicyDecision`) exactly as given. The engine re-runs automatically after every `onEdit` / `onFix` / `onSelect`.
2. **Compose only from `@/components/ui`** (Button, Pill, PillButton, Card, SectionLabel, Segmented, Disclosure, StatusIcon, Field, Input, Select, TriToggle, Checkbox, Modal). If you need a new primitive, ask C1.
3. **Don't edit** `app/page.tsx`, `components/TopBar|SearchHero|ResultsList.tsx`, `components/ui/*`, `lib/*`, or `app/globals.css`.
4. Status always uses **icon + color** (`<StatusIcon status=…/>`), never color alone.
5. Delete the `<Placeholder>` once a component is done.

## Look & feel (Devin-style)

| Token (Tailwind class) | Use |
|---|---|
| `bg-surface` / `bg-subtle` / `bg-sunken` | white page / faint section / pills & inputs |
| `text-ink` / `text-ink-2` / `text-muted` / `text-faint` | primary / secondary / helper / hint text |
| `border-line` / `border-line-strong` | hairline borders |
| `bg-ink text-white rounded-full` | primary action (use `<Button>`) |
| `text-accent` / `bg-accent-soft` | SFSU purple, **accent only** (edited chips, focus) |
| `pass` / `warn` / `block` / `escalate` (+ `-soft`) | status text / soft backgrounds |

Use lots of whitespace, `rounded-2xl` cards, `text-sm` body, and one primary button per area. No gradients, no heavy color blocks.
The one exception is Tier 3, which uses `bg-escalate-soft` so it reads as clearly different.

## Prop contract

| Component | Props | Notes |
|---|---|---|
| `FactChips` | `facts, original, onEdit(field, value)` | style by `facts[f].source`: `ai` neutral · `user` accent + pencil · `default` dashed "Assumed: …" · `null` amber "?" |
| `ClarifyingQuestions` | `questions: Unresolved[], ambiguities, facts, onAnswer(field, value)` | Yes/No for tri-state fields, inputs for headcount/date/time |
| `TierPanel` | `decision, targetRoom, suggestedRoom, writer, attested, onAttest, onFix, onSubmit, submitting, result` | T1 attest+Book · T2 **Fix It** (hero) · T3 staff review, no Fix It · success/error after submit |
| `ComplianceChecklist` | `results: PolicyRuleResult[], onCite(ruleId)` | icon · title · detail · clickable rule id |
| `RoomCard` | `ranked: RankedRoom, variant: "best"\|"row"\|"unavailable", isTarget, onSelect(roomId)` | "Why #1" from `ranked.reasons` |
| `PermitDraft` | `permit: PermitRequirement, narrative` | read-only paper-form look |
| `QuickFilters` | `value: EventFacts, onChange(facts), onSubmit()` | use `setFact()` from `lib/normalize` |
| `ClubSwitcher` | `clubs, clubId, onChange` | already functional, restyle |
| `QuotaMeter` | `usedMin \| null, requestMin, capMin` | already functional, restyle + bar |
| `AiModeBadge` | `mode` | tiny, unobtrusive |
| `PolicyExcerptModal` | `ruleId \| null, onClose` | functional, add effect pill + office |
| `PolicyBanner` | — | done; tweak only if needed |

Helpers: `lib/client/format.ts` (`fmtTime`, `fmtDate`, `fmtRange`, `fmtMinutes`, `FACT_LABEL`, `fmtFactValue`), `lib/rank.ts` (`avLabel`), `lib/data.ts` (`ROOMS`, `ROOM_BY_ID`, `POLICY_BY_ID`, `CLUBS`).

## Build order

FactChips → TierPanel → RoomCard → ComplianceChecklist → PermitDraft → ClarifyingQuestions → QuickFilters → small bits.

## Acceptance checklist

- [ ] **FactChips:** all three source styles are visibly different. Editing headcount 45 → 60 on `/?fixture=pizza` turns that chip "edited". Escape cancels an edit. Works with the keyboard alone.
- [ ] **TierPanel T1** (`study`): Book is disabled until the attestation box is checked, and the box lists the assumed items.
- [ ] **TierPanel T2** (`pizza`): Fix It names *Cesar Chavez Student Center 204*. Clicking it changes the headline to "Ready to book…" (that's `pizza-fixed`).
- [ ] **TierPanel T2 hard block**: switch the club to SF Hacks on pizza. The daily-limit message shows and there's no Book button.
- [ ] **TierPanel T3** (`speaker`): staff-review styling, the briefing risk points and staff questions are listed, and there's no Fix It.
- [ ] **TierPanel result**: the success state shows room + time + status, and a server rejection lists the error messages (see both in `/dev`).
- [ ] **ComplianceChecklist:** the FOOD-01 row goes block → pass after Fix It, and clicking a rule id opens the modal.
- [ ] **RoomCard:** best / row / unavailable all look distinct, unavailable rooms show their conflict messages, and the target shows "Selected".
- [ ] **PermitDraft:** every field renders, plus the narrative when one is present.
- [ ] **QuickFilters:** changing values then Find rooms gives results with no network request.
- [ ] Zero console errors, it works at 375px width, and focus rings are visible.

## Hero click script (must pass on `/`)

1. Click **Pizza coding night**.
2. Chips show 45 attendees, Thu Oct 8 · 6–9 PM, Food: Yes, Building: Thornton Hall.
3. The banner says *Needs one change: food isn't allowed in Thornton Hall 326*.
4. Click **Fix it: switch to Cesar Chavez Student Center 204**. The checklist turns green apart from the food-permit row, and the permit draft appears.
5. Check the attestation, then click **Book**. The success state shows *pending permit*.
6. Open `/admin`. The booking appears in the log with the Fix It room change recorded as a user correction.
