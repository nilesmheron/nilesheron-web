# Prompt builder + extraction goal control
**Date:** 2026-04-27  
**Scope:** Kimba admin — new session modal  
**Roadmap item:** 1 of 7

---

## What this is

Replace the three-button hardcoded extraction goal picker in the new session modal with a full prompt control surface. Admin describes what they want to learn in natural language; Sonnet generates a structured Kimba system prompt; admin reviews and optionally edits it before creating the session. The three existing modes stay as starting templates that pre-populate the description field.

---

## Modal UX — four phases

The modal inner content replaces entirely between phases. This pattern is already established in the codebase (`showSessionCreated()` does a wholesale replacement today).

### Phase 1 — configure

**Left column:**
- Client name (unchanged)
- Expected respondents (unchanged)
- `max_exchanges` — number input, default 10, range 4–20, labeled `/ max exchanges` in mono
- Closing message — short text input; what Kimba says as the conversation winds down
- Starting point — the three mode buttons re-labeled as a template picker ("starting point" not "extraction goal"). Selecting one populates the description textarea below it; does not submit.
- Description textarea — "describe what you want to learn from these conversations…"
- Footer: "Generate prompt →" primary button, enabled when client name is filled

**Right column:** Static template preview, same as today (coverage, recommended count, opener). Updates when a template is selected.

### Phase 2 — loading

Both columns replaced by a centered loading state: "generating…" with typing dots. Same visual pattern as BeginTransition in the respondent page.

### Phase 3 — review

**Left column:**
- Editable textarea: generated `intake_system_prompt`, labeled `/ kimba's system prompt`
- Editable field below it: `opener_message`

**Right column:**
- `<details>` accordion labeled `/ advanced · full config` — read-only `<pre>` block showing the full JSON that will be saved: `intake_system_prompt`, `opener_message`, `analysis_system_prompt`, `scoring_dimensions`, `closing_message`. Not editable.
- "save as template" secondary button. Clicking expands an inline prompt (small text input for template name + confirm button) directly in the right column — no new modal.

**Footer:** "← back" text link (returns to phase 1, description intact) + "Create & generate link →" primary button (always enabled in phase 3).

### Phase 4 — created

Existing `showSessionCreated()` state. No change.

---

## API contract

### New: `POST /api/vh-admin` — `action: 'generate_prompt'`

Admin auth required. Calls Sonnet with a meta-prompt instructing it to output a Kimba system prompt config in JSON, oriented by `base_goal` if provided.

**Request body:**
```json
{
  "action": "generate_prompt",
  "description": "I want to understand how this client feels about their brand voice…",
  "base_goal": "discovery"
}
```
`base_goal` is `'discovery' | 'intake' | 'feedback' | null`.

**Response:**
```json
{
  "intake_system_prompt": "...",
  "opener_message": "...",
  "analysis_system_prompt": "...",
  "scoring_dimensions": ["dim_one", "dim_two", "dim_three"]
}
```

`closing_message` is NOT generated — it comes from the admin's phase 1 input and is passed through unchanged.

### Session creation — two sequential browser calls

After "Create & generate link →":

**Call 1:** `PUT /api/vh-goal-config`
```json
{
  "goal_key": "custom-{crypto.randomBytes(4).toString('hex')}",
  "name": "<client name>",
  "intake_system_prompt": "...",
  "opener_message": "...",
  "analysis_system_prompt": "...",
  "scoring_dimensions": [...],
  "closing_message": "...",
  "is_template": false
}
```
Creates the `vh_goal_configs` row. If admin flagged "save as template", `is_template: true` and the admin-entered template name is stored in the `name` field. When `is_template: false`, `name` holds the client name.

**Call 2:** `POST /api/vh-session`
```json
{
  "client_name": "...",
  "extraction_goal": "custom-{same-key}",
  "expected_respondent_count": 8,
  "max_exchanges": 10
}
```

### Changes to existing endpoints

**`vh-session.js` POST:**
- Accept `max_exchanges` on creation (currently only PATCH-able via `vh-admin.js`).
- Relax `extraction_goal` validation: replace the hardcoded `['discovery', 'intake', 'feedback'].includes(extraction_goal)` check with the pattern `^[a-z0-9][a-z0-9-]*$` — same regex already used in `vh-goal-config.js PUT`. No DB roundtrip needed.

**`vh-goal-config.js` PUT:**
- Accept two new optional fields: `closing_message` (text) and `is_template` (boolean, defaults false).
- Required fields unchanged: `goal_key`, `name`, `intake_system_prompt`, `opener_message`, `analysis_system_prompt`, `scoring_dimensions`.

---

## DB migration

One migration on `vh_goal_configs`:

```sql
ALTER TABLE vh_goal_configs
  ADD COLUMN closing_message TEXT,
  ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT false;
```

No changes to `vh_clients`. `max_exchanges` is already a column there.

**No other schema changes.** `vh-analysis-utils.js` already fetches `analysis_system_prompt` and `scoring_dimensions` from `vh_goal_configs` by `goal_key` — custom keys work end-to-end with zero changes to the analysis flow. `kimba/index.html` already fetches `intake_system_prompt` and `opener_message` from `GET /api/vh-goal-config?goal=<key>` — same, no changes needed.

---

## Error handling

Three failure points:

| Point | Behavior |
|---|---|
| Generate fails (Anthropic error or timeout) | Replace loading phase with error state: "something went wrong generating the prompt" + "Try again" button that returns to phase 1 with description intact |
| Goal config save fails (call 1) | Inline error on Create button, re-enable. Session row never written — nothing to clean up. |
| Session create fails (call 2) | Inline error, re-enable. Orphaned `vh_goal_configs` row is harmless — no `vh_clients` points at it, won't surface in admin. |

---

## What doesn't change

- `kimba/index.html` — zero changes
- `vh-analysis-utils.js` — zero changes
- `vh-response.js` — zero changes
- The three built-in modes (`discovery`, `intake`, `feedback`) remain in `vh_goal_configs` and continue to work for any existing sessions
- The "session created" phase 4 — zero changes

---

## Out of scope

- Template library browser UI (roadmap item 6) — `is_template` flag is planted here for item 6 to build on
- Closing message as an editable field in session settings (roadmap item 5) — `closing_message` column is planted here for item 5 to surface
- Editing a prompt after session creation — out of scope for this item
- Streaming the generation response — single blocking call is fine for a prompt config
