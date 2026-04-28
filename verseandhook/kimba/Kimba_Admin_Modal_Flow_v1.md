# Kimba — Admin Modal Flow Map
## New Session Creation — Redesign Spec

**Captured:** 2026-04-27
**Status:** Approved for build — review before deploy

---

## Decisions Locked

- Synthesis: AI pass (not template-driven) — richer, more natural output
- Question order: drag to reorder
- Phase 3 (review opener + system prompt): survives — AI generates opener, user edits in Phase 3
- Synthesis result shown with chance to edit before final submit

---

## Full Flow

---

### Phase 1 — Configure

Same as today, simplified.

**Removed:** "Opening line" field (moves to Phase 3, AI-generated). Max exchanges (auto-calculated in Phase 2, still editable).

**Fields:**
- Client name (required — unlocks generate button)
- Expected respondents
- Closing message
- Starting point (mode options — function as "quick start" templates that pre-fill the goal field AND seed 5 default questions in Phase 2. Still optional.)
- "What's our goal here?" — freeform, replaces "describe what you want to learn"
- Attachment (file or link, as built)

Preview column: unchanged.

→ **"generate →"** — triggers one AI call that returns: (a) base system prompt, (b) 5 suggested questions with suggested tags, (c) AI-recommended exchange count.

---

### Loading A

"building your prompt and questions…" — centered, same as current generating state.

---

### Phase 2 — Questions + Base Prompt (new)

**Left column — base prompt:**
- Label: / base prompt
- Editable textarea with AI-generated base prompt (tone, goal, Kimba's mission for this session — no question instructions yet)

**Right column — question builder:**
- Label: / questions
- Draggable list — 5 AI-suggested questions, each row:
  - ⠿ drag handle
  - Question text (editable input)
  - Tag selector: simple / complex / number / no-follow-up
  - × remove
- + add question below the list
- Auto-calculated max exchanges shown beneath: / recommended: 18 exchanges (editable field, recalculates as tags change — formula: no-follow-up=1, simple=2, number=2, complex=4, plus 4 buffer)

**Footer:** ← back | synthesize →

→ **"synthesize →"** — triggers second AI call with: base prompt + ordered question list + tags + attachment context. Returns full synthesized system prompt.

---

### Loading B

"merging questions into your prompt…"

---

### Phase 3 — Review (replaces current phase 3)

**Left column:**
- Label: / review
- / opener — editable textarea (AI-generated opener; opener moves here from Phase 1 — AI generates it, user edits)
- Save as template button (same as today)
- Footer: ← back | create & generate link →

**Right column:**
- Label: / kimba's system prompt
- Full synthesized prompt (editable) — this is the merged result
- + / advanced edit toggle → analysis prompt, scoring dimensions, JSON (same as today)

→ **"create & generate link →"** — saves goal config + creates session.

---

### Created State

Unchanged.

---

## What Changes vs. Today

| | Today | New |
|---|---|---|
| Goal input | "describe what you want to learn" | "what's our goal here?" |
| Questions | Baked into goal description | Explicit list with tags |
| Opener | Phase 1 field | AI-generated, editable in Phase 3 |
| Max exchanges | Phase 1 field, manual | Auto-calculated from tags, editable in Phase 2 |
| AI calls | 1 (generate prompt) | 2 (generate base + synthesize) |
| Phases | 3 + created | 4 + created (2 loading transitions) |
| Mode options | Pre-fill description | Pre-fill goal + seed questions |

---

## Tag Behavior (Synthesis Instructions)

- **simple** — "ask once, accept any answer, move on." (~2 exchanges)
- **complex** — "spend 2-3 exchanges, follow up if interesting." (~4 exchanges)
- **number** — "get a specific figure, brief follow-up if needed." (~2 exchanges)
- **no-follow-up** — "ask once, take whatever they give, move on immediately." (1 exchange)

Exchange formula: sum of per-question values + 4 buffer = recommended max.

---

## What Needs to Be Built

- `vh-admin.js`: new action `synthesize_prompt` (takes base prompt + question list + tags → returns merged system prompt)
- `admin.html`: Phase 2 (question builder with drag-to-reorder, tag selectors, exchange calculator), Phase 3 updated, Phase 1 simplified, Loading B state
- Existing `generate_prompt` action extended to also return suggested questions + tags

## What Stays the Same

- Session creation logic
- Attachment handling
- Phase 3 advanced edit
- Created state
- All respondent-side code
