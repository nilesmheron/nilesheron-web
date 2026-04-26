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

Two buckets. Both can post to a single `/api/track` Vercel edge function that writes to whatever store v&h is using (Vercel KV, Supabase, etc.).

**Funnel events** — emit one of these per respondent session:
- `session.landed` — token validated, landing rendered
- `session.started` — clicked Begin, identity captured
- `session.first_reply` — user sent their first message
- `session.exchange_3`, `session.exchange_5`, `session.exchange_7` — depth checkpoints
- `session.completed` — `[INTAKE_COMPLETE]` triggered
- `session.exited` — user clicked "wrap up" early (vs. natural completion)

**Quality metrics** — compute on `session.completed`, store on the session row:
- `time_to_first_message_ms` — landing render → first user reply
- `avg_user_reply_words`
- `total_duration_ms`
- `completion_mode` — `complete | wrap_up | timeout`

**Admin view** — deferred to a future phase. Events are instrumented as of Phase 6 (`vh_events` table, `POST /api/vh-track`). Build the surface once real data has accumulated. Proposed additions to the admin analysis screen:
- Per-mode completion rate (Brand Discovery vs Project Intake vs Engagement Feedback)
- Average exchange depth before completion
- Drop-off heatmap by exchange number

Data is available now. Surface design is the next step when V&H is ready to act on it.

---

## Copy that's still TODO

Per the user, copy is being addressed in Claude Code, not in design. Specifically:

- Final opener prompts for each of the 3 extraction modes (currently only brand discovery has a polished opener; the other two have placeholders in `MODE_DETAILS` in `states.jsx`).
- Closing-message variants per mode.
- Microcopy: input placeholders, error toasts, empty states, network-fail copy.
- Email templates for sending links to respondents (V2 per PRD; draft now while the rest is being built).
- Admin-side analysis narrative copy (currently fabricated for the Altona example in `surfaces/admin.jsx` — replace with real LLM output).

---

## What's intentionally **not** in this prototype

- Auth flow beyond the visual login (no token refresh, session timeout, 2FA)
- Real streaming — typing-dots are a static animation, not an SSE/streaming proxy
- File attachments in chat (PRD doesn't ask for it)
- Multi-language (English only)
- Email sending (link copying only)
- Analytics dashboard (events spec'd above, surface not designed)

---

## Design tokens — drop in as-is

Open `kimba-tokens.css`. Copy the `:root { ... }` block into the production CSS. Don't redefine the palette. The whole system is calibrated against:
- `--kimba-red: #D9181E` (single accent — use sparingly, mostly for the "." period and the primary button)
- `--kimba-ink: #0D0D0D` (text)
- `--kimba-paper: #F6F2EC` (warm cream — main background)
- `--kimba-paper-2: #EFE9DE` (slightly deeper cream — section breaks, sidebars)

The "kimba twist" (vs. parent brand V&H) is **typographic**: lowercase Archivo headlines + Fraunces serif for AI dialog. Don't capitalize Kimba's voice. Don't swap to a different serif.

---

## Open questions for the v&h team

1. Should "expected respondent count" be editable after session creation? Currently the modal sets it once; admin view shows it as a target.
2. What happens at the 2-week expiry — auto-archive, manual archive, or sit forever in a "closed" tab? Affects the admin list view's status filtering.
3. Does the analysis output need to be exportable (PDF/email to client)? Not designed for; ask before building.
4. Is there a v0 client view (clients seeing their own analysis) or is this admin-only forever? Affects auth model.
