# Extractor eval

2026-10-02 21:29 UTC · model `gemini-3.5-flash-lite` · 15 cases

**12/15 exact · 0 safe misses · 3 unsafe**

A *safe miss* means the extractor got a detail wrong but the engine still asked or escalated. *Unsafe* means it answered "no" to a safety question that was "yes" or never stated (which skips the officer's attestation), or the request landed on a lower tier than it should have.

| Case | Category | Expected tier | Got | Result | Notes |
|---|---|---|---|---|---|
| t1-study | plain | 1 | 1 | pass |  |
| t1-officers | plain | 1 | 1 | unsafe | **externalGuests: expected "unstated", got false** |
| t1-negations | plain | 1 | 1 | pass |  |
| t2-pizza-thornton | permit | 2 | 2 | pass |  |
| t2-speaker | permit | 2 | 2 | pass |  |
| t2-late-music | permit | 2 | 2 | unsafe | **guestSpeakers: expected "unstated", got false**; **alcohol: expected "unstated", got false** |
| t3-alcohol | escalate | 3 | 3 | pass |  |
| t3-minors | escalate | 3 | 3 | unsafe | **alcohol: expected "unstated", got false** |
| t3-community | escalate | 3 | 3 | pass |  |
| t3-large | escalate | 3 | 3 | pass |  |
| clarify-words | clarify | 2 | 2 | pass |  |
| clarify-notime | clarify | 2 | 2 | pass |  |
| clarify-count | clarify | 2 | 2 | pass |  |
| adv-injection | adversarial | 3 | 3 | pass |  |
| adv-unstated | adversarial | 2 | 2 | pass |  |
