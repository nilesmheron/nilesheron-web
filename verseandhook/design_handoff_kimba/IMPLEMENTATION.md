# Kimba — Implementation handoff

This document is for the engineer (likely Claude Code) implementing Kimba against the V&H stack. The HTML prototype in this folder is the visual + interaction source of truth; this doc maps it to real code.

---

## What Kimba is

A conversational intake agent that runs short, scoped chats with respondents on behalf of V&H. Three extraction modes: brand discovery, project intake, engagement feedback. Each session generates a tokenized link per respondent. After 2+ responses, the admin can run alignment analysis across transcripts.

---

## Source of truth

| What | Where |
|---|---|
| Visual design + interaction | `index.html` (open it; surface switcher in top bar) |
| Brand canvas + variations | `canvas.html` |
| Design tokens (colors, type, spacing, radii, shadows) | `kimba-tokens.css` — copy-paste these into the production CSS |
| Component patterns | `components.jsx` (KimbaMark, Wordmark, TypingDots, ProgressDots, etc.) |
| Per-surface markup | `surfaces/*.jsx` |

Everything in the prototype is mocked client-side. Real data wiring is your job.

---

## Surfaces & their backend contracts

The PRD already defines the API surface (`/api/chat`, `/api/vh-session`, `/api/admin/*`). This is how each prototype screen maps to those endpoints.

### 1. Landing (`surfaces/landing.jsx`)
- Token validation: `GET /api/vh-session/{token}` on mount.
  - Valid → render landing form.
  - Invalid → render `TokenError kind="invalid"` (see `surfaces/states.jsx`).
  - Expired → `TokenError kind="expired"`.
  - Already used → `TokenError kind="used"`.
- Identity form fields: `name`, `role`, optional `relationship` field. Persist to session on Begin.
- Click "begin" → `POST /api/vh-session/{token}/start` → on success transition to **BeginTransition** (loading state) for ~600ms while first AI message streams, then chat.

### 2. Chat (`surfaces/chat.jsx`)
- Each user reply: `POST /api/chat` with full conversation history (per existing nilesheron-web pattern).
- Stream AI response if backend supports it; the typing-dots component handles the pre-stream beat.
- Watch for `[INTAKE_COMPLETE]` sentinel in AI output → advance to thanks.
- Network failure → render `<NetworkError onRetry={...} />` overlay (modal in `states.jsx`). Conversation state must survive retry — buffer the user's last message client-side and re-POST.
- Mobile keyboard: see "Mobile keyboard spec" below.

### 3. Thanks (`surfaces/thanks.jsx`)
- `POST /api/vh-session/{token}/complete` after the closing screen renders.
- Mark token as `used` on the backend so refresh shows the `used` error state, not a fresh chat.

### 4. Admin (`surfaces/admin.jsx`)
- Behind password gate (`AdminLogin` in `states.jsx`). Use whatever auth the existing nilesheron-web admin uses; if none, password env var + cookie session is fine.
- List view: `GET /api/admin/sessions` → array of `{id, clientName, mode, expectedCount, completedCount, createdAt, status}`.
- Detail view: `GET /api/admin/sessions/{id}` → session metadata + transcripts array.
- Analysis: `POST /api/admin/sessions/{id}/analyze` → returns dimension axes + per-respondent positions + narrative summary. While in flight, render `<RunAnalysisOverlay pct={...} />`.
- Locked state: if `completedCount < 2`, render `<AnalysisLocked count={completedCount} />` instead of the run-analysis CTA.
- "+ new session" → `<NewSessionModal>` → `POST /api/admin/sessions` with `{clientName, mode, expectedCount}` → returns session id + base link. Show generated link in a follow-up "session created" state (not yet designed — propose a simple toast + copyable link inside the modal).

### 5. States (`surfaces/states.jsx`)
This is a **prototype-only navigation surface** for previewing edge states. Don't ship it. Each subcomponent (`AdminLogin`, `TokenError`, `NetworkError`, `EmptyAdmin`, `AnalysisLocked`, `NewSessionModal`, `BeginTransition`, `RunAnalysisOverlay`) is a real screen — wire them into the live flow at the trigger points listed above.

---

## URL / token format

Pattern in the prototype: `kimba.vh/s/{client-slug}-{token}`
- `client-slug`: lowercased, kebab-cased client name truncated to 18 chars (computed at session creation, stored)
- `token`: opaque random string, 8–12 chars, URL-safe (e.g. nanoid)

**Match whatever the existing `verseandhook/intake/` route already uses.** The prototype's URL shape is illustrative; if the existing route uses a query param or a bare token, don't change it just to match the mock.

---

## Mobile keyboard spec

Recommended approach (use this; fall back to #2 if you hit browser issues):

1. **Visual viewport API** (`window.visualViewport`):
   - Listen to `visualViewport.resize` and `visualViewport.scroll`.
   - Compute `keyboardHeight = window.innerHeight - visualViewport.height`.
   - Apply `padding-bottom: ${keyboardHeight}px` to the chat thread container, OR pin the composer with `transform: translateY(-${keyboardHeight}px)`.
   - On every keyboard open/close + every new message, scroll the thread to the latest AI message (use `el.scrollTo({ top: el.scrollHeight })` — never `scrollIntoView`, which jumps the whole page).

2. **Fallback**: full-viewport flex column with `height: 100dvh` (dynamic viewport units). Composer is the last flex child with `flex-shrink: 0`. iOS Safari respects this once you have a `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and the input isn't `position: fixed`.

Acceptance criteria:
- Composer is always visible above the keyboard, no overlap.
- The latest AI message is visible above the composer when the keyboard opens (scroll-to-bottom on focus).
- Pinch-zoom is disabled (`maximum-scale=1`) — kimba is a focused conversation, not a zoomable doc.
- Tested on iOS Safari 15+, Chrome Android, and at least one in-app browser (Instagram, Slack).

---

## Analytics

Events are instrumented as of Phase 6 (`vh_events` table, `POST /api/vh-track`). Four events fire from the respondent flow: `session.landed`, `session.started`, `session.completed` (with quality metrics in `meta`), `session.errored`.

**Next up — "is this working?" stats on the client overview** (not a full analytics view)

Add a compact stats row at the bottom of each client detail page showing aggregate health for that session. Pull directly from `vh_events` filtered by the client's existing respondent tokens — no new endpoint needed, fold into the existing `GET /api/vh-admin?client_id=` response.

Stats to show:
- Landed → started conversion (how many people who got the link actually began)
- Started → completed conversion (how many who began finished)
- Average conversation duration
- Any `session.errored` count flagged as a warning if > 0

**v2 — Full analytics dashboard** (delay until 50+ sessions)

Deferred from the original Phase 7A/7B scope. Build when there's enough volume for the numbers to mean something.

- `/analytics` sidebar view with completion funnel across all sessions
- Per-mode breakdown (Brand Discovery vs Project Intake vs Engagement Feedback)
- Average exchange depth, duration, error rate
- Drop-off heatmap by exchange number (Chart.js)
- Time-range filter (7 days / 30 days / all time)
- CSV export of raw `vh_events`

---

## Roadmap

### Next up (priority order)

**1. Prompt builder + extraction goal control in new client modal**

The new session modal currently lets admin pick from three hardcoded extraction goals. Replace with a full prompt control surface:
- Admin writes a natural-language description of what they want to learn ("I want to understand how this client feels about their brand voice and whether the team is aligned on positioning")
- Sonnet/Opus translates that into a structured Kimba system prompt (interviewer persona, question areas, depth cues, closing trigger logic)
- Admin reviews the generated prompt in a preview pane
- "Set prompt" button saves it to the session's `vh_goal_configs` row
- Also expose: `max_exchanges`, `expected_respondent_count`, and closing message as editable fields in this surface

DB implication: `vh_goal_configs` needs a `custom_prompt` field or the existing `intake_system_prompt` column is used directly. The generation step calls `POST /api/vh-admin` with `action: 'generate_prompt'`.

**2. "Re-run all analysis" backdoor trigger**

A single button (hidden or in a settings/dev section of admin) that fires `rerun_analysis` for every client in `vh_clients` that has ≥2 responses. Useful after prompt schema changes. Calls the existing `POST /api/vh-admin` analysis endpoint sequentially to avoid hammering Anthropic rate limits.

**3. Microcopy pass**

Polish all user-facing strings that are currently placeholder or generic:
- Input placeholders on landing form (name, role, email fields)
- Error states: network-fail overlay, token invalid/used screens
- Empty states in admin (no sessions yet, no respondents yet, analysis locked)
- Progress indicator label ("kimba's getting ready" copy)
- Thanks view body copy (currently generic; should vary by extraction goal)

**4. Email templates**

Draft copy for the link-distribution email V&H sends to respondents manually (v1 — copy/paste, not automated sending). Three variants matching the three extraction modes. Should feel like it's from the V&H team, not from Kimba. Include: context-setting sentence, what the respondent should expect, estimated time, the link.

**5. Closing message in session settings**

Surface the closing message (what Kimba says as the conversation winds down) as an editable field in the admin session settings tab. Currently hardcoded in the system prompt. Extract it into its own `vh_goal_configs` column (`closing_message`) so it can be customized per session without touching the main prompt.

**6. Fetchable extraction goal templates ("Kimba templates")**

An admin panel section — separate from the new session modal — that maintains a library of reusable extraction goal templates. Each template has: a name, a short description, a full system prompt, a default closing message, and recommended `max_exchanges`. Admin can browse, preview, and apply a template when creating a new session, or build from scratch using the prompt builder (item 1). Templates are stored in `vh_goal_configs` with a `is_template: true` flag (or a separate `vh_templates` table). Written in Kimba's voice — lowercase, direct, persona-consistent.

**7. Client-facing analysis deliverable**

Export the session analysis as a shareable artifact V&H can send directly to clients. Minimum: a clean HTML/print view of the analysis tab content (narrative + dimension cards + quadrant) accessible via a signed URL (no admin login required). Stretch: PDF generation via browser print stylesheet. The signed URL lives on `vh_clients` as a `share_token` column; `GET /api/vh-share?token=` serves the read-only view.

---

### Delay (moved to v2)

- **Full analytics dashboard** (Phase 7A/7B) — events are collected; build the surface at 50+ sessions
- **Multi-user distribution** — admin enters email list, system sends tokenized links automatically
- **Custom extraction modes without code deploy** — move system prompts fully server-side
- **Client portal** — clients logging in to see their own analysis
- **Session templates with saved distribution lists**
- **Role-based access control** — multiple admin users with different permission levels

---

## Copy that's still TODO

- Opener prompts for Project Intake and Engagement Feedback modes (brand discovery is polished; the other two have placeholders)
- Closing-message variants per mode (to be surfaced in session settings — see roadmap item 5)
- Microcopy across landing, error, and admin surfaces (see roadmap item 3)
- Email templates for manual link distribution (see roadmap item 4)

---

## What's intentionally **not** in this prototype

- Auth flow beyond the visual login (no token refresh, session timeout, 2FA)
- Real streaming — typing-dots are a static animation, not an SSE/streaming proxy
- File attachments in chat (PRD doesn't ask for it)
- Multi-language (English only)
- Email sending (link copying only)
- Analytics dashboard (events spec'd above, surface deferred to v2)

---

## Design tokens — drop in as-is

Open `kimba-tokens.css`. Copy the `:root { ... }` block into the production CSS. Don't redefine the palette. The whole system is calibrated against:
- `--kimba-red: #D9181E` (single accent — use sparingly, mostly for the "." period and the primary button)
- `--kimba-ink: #0D0D0D` (text)
- `--kimba-paper: #F6F2EC` (warm cream — main background)
- `--kimba-paper-2: #EFE9DE` (slightly deeper cream — section breaks, sidebars)

The "kimba twist" (vs. parent brand V&H) is **typographic**: lowercase Archivo headlines + DM Sans for chat messages, Archivo condensed for headings/wordmark. Don't capitalize Kimba's voice.

---

## Open questions — resolved

1. **Expected respondent count editable after creation?** Yes — now editable in session settings tab.
2. **2-week expiry behavior?** Not yet decided; clients sit in list indefinitely for now.
3. **Analysis exportable?** Yes — client-facing deliverable is on the roadmap (item 7).
4. **Client view of analysis?** Admin-only for v1; client portal deferred to v2.
