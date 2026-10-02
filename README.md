# GatorSpace

**Describe your event in plain English. GatorSpace checks campus policy, ranks the rooms that fit, and files the paperwork.**
Routine requests are approved automatically. Risky ones go to Student Activities & Events with a briefing already written.

> The AI interprets intent; deterministic code enforces policy.

> **Prototype:** policy rules and room data are illustrative, modeled on SFSU workflows, not authoritative university policy.

## Who it's for

- **Student organization officers.** Today a room request waits 7–10 days while staff read it. Routine requests now book instantly, and fixable ones say exactly what to change ("food isn't allowed in Thornton 326 → move to CCSC 204").
- **Student Activities & Events (SA&E) staff.** Only requests that need judgment (alcohol, minors, outside guests, 100+ people) reach the queue, with a briefing and rule citations already written.
- **Environmental Health & Safety and other offices.** Permit drafts (temporary food, guest speaker) arrive pre-filled from the request.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server (`/`, `/admin`, `/dev` component gallery) |
| `npm test` | unit tests for the deterministic engine |
| `npm run fixtures` | regenerate `fixtures/` from `data/demo-cache.json` through the real engine |
| `npm run demo:reset` | restore demo bookings, clear audit snapshots |
| `npm run typecheck` | TypeScript check |

Env (`.env.local`): `GEMINI_API_KEY`, optional `GEMINI_EXTRACTOR_MODEL`, `GEMINI_WRITER_MODEL`, `NEXT_PUBLIC_DEMO_ANCHOR_DATE` (default `2026-10-05`), and `NEXT_PUBLIC_USE_FIXTURES=1` to serve presets without a server.

## How it works

```
text → Gemini extractor → EventDraft → draftToFacts (contextual defaults) → EventFacts ⇄ officer corrections
     → evaluate() → PolicyDecision (the only tier/approval decision) → rankRooms()
     → tier 2/3: Gemini writer explains → createBooking() re-validates → DecisionSnapshot
```

- `lib/types.ts`: the shared contract
- `lib/policy.ts`: rule evaluators; tier logic lives only here
- `lib/rank.ts`: explainable lexicographic ranking
- `lib/normalize.ts`: date parsing and defaults
- `lib/booking.ts`: authoritative booking, re-checked at commit time
- `data/policy.json`: rule metadata (effect, scope, office, excerpt)

## Responsible AI

- **The AI never decides.** Gemini reads the request (extractor) and explains the result (writer). Tier, approval and room eligibility come only from `lib/policy.ts`, and the writer runs after the decision is made, on structured fields only.
- **Unknown is never "no".** Safety fields (food, sound, outside guests, guest speakers, alcohol, minors) are `true | false | null`. A `null` blocks auto-approval and becomes a clarifying question.
- **An AI "no" needs evidence.** If the extractor says "no alcohol" but the text never says so, `requireNegationEvidence()` (`lib/sanitize.ts`) turns it back into unknown. Measured on a 15-case eval set: [`docs/eval-results.md`](docs/eval-results.md) (`npm run eval`).
- **Auto-approval needs positive evidence.** Tier 1 requires every safety field resolved, no flags or permits, an eligible room, and the officer's attestation for every assumed default (shown as "assumed" chips).
- **Rechecked at commit time.** `createBooking()` re-runs the full engine against current bookings, so a stale screen can't double-book a room or exceed the 3-hour daily cap.
- **Human in the loop, with an audit trail.** Tier 3 always goes to SA&E staff. Every booking stores a decision snapshot: the request, what the AI extracted, what the officer corrected, the rules matched, and the outcome. No model reasoning text is stored.
- **Data minimization and bias.** Only the event description goes to the model: no student names, IDs or club name, so the decision can't depend on who is asking. Rule IDs the writer cites that don't exist in `policy.json` are stripped.
- **Graceful failure.** With no key or a Gemini error, presets replay the demo cache, free text uses an offline extractor, and the badge says so.
- **Accessibility.** Keyboard navigation, ARIA labels, every status shown with an icon as well as color, and an ADA room requirement in the engine.
- **In production:** a university-contracted LLM with no training on our data, and data retention set by SA&E policy.

## Path to adoption at SFSU

1. **Pilot:** one semester with SA&E on one building, running GatorSpace alongside the current process and comparing decisions.
2. **Identity:** SFSU Shibboleth SSO replaces the "Acting as" club switcher, tied to verified officer rosters.
3. **Rooms:** sync rooms and live availability from the campus reservation system instead of `data/rooms.json`.
4. **Policy:** rules are data (`data/policy.json`: effect, scope, office, excerpt), so SA&E can maintain them with a policy editor without touching the AI.

The team plan is in [`docs/PLAN.md`](docs/PLAN.md). Per-machine handoffs are in `docs/handoff-*.md`, and the UI guide is [`docs/frontend-guide.md`](docs/frontend-guide.md).
