# GatorSpace

**Describe your event in plain English. GatorSpace checks campus policy, ranks the rooms that fit, and files the paperwork.**
Routine requests are approved automatically. Risky ones go to Student Activities & Events with a briefing already written.

> The AI interprets intent; deterministic code enforces policy.

> **Prototype:** policy rules and room data are illustrative, modeled on SFSU workflows, not authoritative university policy.

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

The team plan is in [`docs/PLAN.md`](docs/PLAN.md). Per-machine handoffs are in `docs/handoff-*.md`, and the UI guide is [`docs/frontend-guide.md`](docs/frontend-guide.md).
