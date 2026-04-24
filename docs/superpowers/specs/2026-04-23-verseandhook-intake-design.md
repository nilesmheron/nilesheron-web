# Verse and Hook — Client Onboarding Intake Tool
**Design spec · 2026-04-23**

## Overview

A configurable conversational interview tool for Verse and Hook to capture onboarding information from multiple client stakeholders. An AI-guided intake collects structured information per extraction goal; a server-side analysis computes alignment and divergence scores across respondents after each submission. The admin manages client sessions and reviews results through a password-protected dashboard.

Lives at `dev.nilesheron.com/verseandhook/intake` inside the `nilesheron-web` repo. Shares the existing OneBite Supabase project (`xszhfxzfybubdlivbfxp`) via new tables. OneBite's existing `feedback` and `reports` tables are untouched.

This build is scoped to the V&H use case. The architecture is designed to extend toward a general-purpose interview platform later (goal configs in `config.js` can migrate to a DB table; new extraction goals can be added without schema changes) but does not implement that platform now.

---

## Data model

Three new Supabase tables:

### `vh_clients`
One row per client session created by the admin.

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `token` | TEXT UNIQUE | Random string; used in the shareable URL |
| `client_name` | TEXT | |
| `extraction_goal` | TEXT | `discovery` \| `intake` \| `feedback` |
| `created_at` | TIMESTAMPTZ | |

### `vh_responses`
One row per completed respondent intake.

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID FK → vh_clients | |
| `respondent_name` | TEXT | |
| `respondent_title` | TEXT | |
| `respondent_email` | TEXT | |
| `transcript` | JSONB | Array of `{role, content}` turns |
| `completed_at` | TIMESTAMPTZ | |

### `vh_analysis`
One row appended each time a new response triggers analysis. The admin dashboard always reads the latest row for a given client.

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `client_id` | UUID FK → vh_clients | |
| `triggered_by_response_id` | UUID FK → vh_responses | |
| `scores` | JSONB | Null when fewer than 2 responses exist |
| `narrative` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

---

## Goal configuration (`config.js`)

All extraction-goal-specific content lives in `verseandhook/intake/config.js` — a single JS object exported to both the intake page and the server-side analysis function. Changing prompts or scoring dimensions is a one-file edit. Migrating to a DB-driven config later requires no schema changes.

Structure per goal:
```js
{
  discovery: {
    name: 'Discovery',
    intakeSystemPrompt: '...',   // Haiku system prompt
    analysisSystemPrompt: '...',  // Sonnet prompt for alignment analysis
    scoringDimensions: [
      'brand_clarity',
      'audience_consensus',
      'goal_alignment',
      'value_prop_consistency',
      'competitive_awareness'
    ]
  },
  intake: { ... },
  feedback: { ... }
}
```

**Scoring dimensions per goal:**

- **Discovery**: brand_clarity, audience_consensus, goal_alignment, value_prop_consistency, competitive_awareness
- **Intake**: scope_alignment, timeline_alignment, budget_alignment, success_criteria_alignment, constraint_awareness
- **Feedback**: satisfaction_alignment, priority_alignment, issue_consensus

Each dimension scores 0–100 reflecting alignment *across* respondents (100 = full consensus, 0 = direct conflict). Scores are null when fewer than 2 responses exist.

---

## API routes

| route | method | purpose |
|---|---|---|
| `api/vh-session.js` | POST | Create a client + token (admin only) |
| `api/vh-client.js` | GET | Fetch client record by token (respondent page load) |
| `api/vh-client.js` | GET + auth | Fetch all clients or single client with responses + latest analysis (admin) |
| `api/vh-response.js` | POST | Save completed intake transcript + trigger analysis |

Analysis runs inside `vh-response.js` after saving the transcript: fetches all transcripts for the client, calls Sonnet, writes a new `vh_analysis` row.

Admin auth: `VH_ADMIN_PASSWORD` env var. On successful password check, the server returns a session token (a deterministic HMAC of the password + a server-side salt). All admin API calls include this token as a header; the server validates by recomputing. Stateless — no session table needed. Token stored in `sessionStorage` — clears on tab close.

---

## Pages

| path | file | description |
|---|---|---|
| `/verseandhook/intake/admin` | `verseandhook/intake/admin.html` | Password-gated admin dashboard |
| `/verseandhook/intake` | `verseandhook/intake/index.html` | Respondent intake (reads `?token=` from URL) |

Both added to `vercel.json` rewrites for clean URLs.

---

## Respondent flow

1. Stakeholder opens `dev.nilesheron.com/verseandhook/intake?token=abc123`
2. Page calls `api/vh-client.js?token=abc123` — fetches `{client_name, extraction_goal}`
3. Invalid token → simple error state
4. Valid token → **landing screen**: Verse and Hook name, client name, one-sentence framing, Start button
5. Start → **identity form**: Name (required), Title (required), Email (required) — not the chat yet
6. Submit → **conversational intake** begins
   - Haiku conducts the interview using the goal's system prompt
   - One question per turn; progress bar at the bottom advances with each exchange
   - System prompt covers all required topic areas for the goal
   - When Haiku has sufficient coverage, it sends a closing message: thanks the respondent, asks if there's anything they'd like to add on reflection
   - Respondent can reply or click a "No, that's all" skip button
   - If the respondent replies, Haiku acknowledges briefly and emits `[INTAKE_COMPLETE]`
   - If the respondent clicks skip, submission triggers immediately — no additional AI turn
7. Transcript + identity POSTed to `api/vh-response.js`
8. Respondent lands on **styled thank-you splash** — Verse and Hook branded, warm, no data visible
9. Respondent never sees scores, analysis, or other stakeholders' responses

---

## Admin flow

### Password gate
Single password input checked against `VH_ADMIN_PASSWORD` via API. Session token stored in `sessionStorage`.

### Main dashboard
- List of all clients: name, extraction goal badge, response count, last response date, status indicator
- "New Client" button → modal form: client name + extraction goal selector → Generate → displays tokenized URL with Copy button

### Client detail view
Two panels:

**Left — Respondents**
List of all respondents who completed intake: name, title, completion time. Click to expand full transcript inline.

**Right — Alignment analysis**
Latest `vh_analysis` row (ordered by `created_at DESC`, limit 1):
- Scored dimensions displayed as labeled values (0–100)
- Brief qualitative narrative (2–4 sentences, most notable alignment or divergence signal)
- Timestamp of last analysis run
- If fewer than 2 responses: "Awaiting more responses to generate alignment scores"

---

## AI system

### Intake (Haiku — `claude-haiku-4-5-20251001`)
One system prompt per extraction goal. All three share structural rules:
- One question per turn
- Match respondent's register; mirror before probing
- No bullets, no phase announcements
- Close with the reflection question before signaling `[INTAKE_COMPLETE]`

Topic territory per goal:
- **Discovery**: brand identity, target audience, competitive landscape, value proposition, business goals, 12–24 month success vision
- **Intake**: project scope, timeline expectations, budget comfort, decision-making structure, definition of done, known constraints
- **Feedback**: what's working, what isn't, priorities for change, satisfaction with current trajectory, what they'd do differently

### Analysis (Sonnet — `claude-sonnet-4-6`)
Called server-side in `vh-response.js` after saving the transcript. Receives:
- All completed transcripts for the client (not just the new one)
- The extraction goal and its scoring dimensions

Returns JSON:
```json
{
  "scores": {
    "brand_clarity": 72,
    "audience_consensus": 41,
    ...
  },
  "narrative": "Strong consensus on brand identity, but notable divergence on target audience — two respondents describe a B2B focus while one describes primarily B2C. This gap is likely to surface in messaging decisions."
}
```

With one respondent: `scores` is `null`; narrative notes it is preliminary and flags the most salient themes from the single response.

---

## Environment variables required

```
SUPABASE_URL                 (already set — shared with OneBite)
SUPABASE_ANON_KEY            (already set — shared with OneBite)
ANTHROPIC_API_KEY            (already set — shared with OneBite)
VH_ADMIN_PASSWORD            (new — admin gate password)
```

---

## Out of scope for this build

- Email/Slack delivery of tokenized links (admin copies and sends manually)
- Multi-tenant support or general platform (OneBite remains a separate product)
- Respondent-facing report or synthesis output
- Editing or deleting client sessions from the admin UI
- Expiring tokens
