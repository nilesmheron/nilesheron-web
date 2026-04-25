# Handoff: Kimba — V&H conversational intake agent

## Overview

Kimba is a conversational intake agent that runs short, scoped chats with respondents on behalf of Verse and Hook. Three extraction modes (brand discovery, project intake, engagement feedback) cover most V&H client engagements. Each session generates tokenized links per respondent. After 2+ responses come in, the admin can run alignment analysis across transcripts to surface convergence, conflict, and outliers.

This bundle covers all five surfaces of the product (landing, chat, thank-you, admin, edge/loading states), a brand canvas with variations, and a full implementation specification.

---

## About the Design Files

The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. They are React-via-Babel-in-the-browser, intentionally lightweight for review.

Your task is to **recreate these designs in the existing V&H codebase** (likely `nilesheron-web` or whatever framework the existing `verseandhook/intake/` route lives in), reusing its established patterns, routing, and API conventions. Lift the visual design and component structure from the HTML; ignore the inline-Babel scaffolding and React patterns specific to this prototype environment.

Open `index.html` to explore — there's a surface switcher in the top bar that toggles between landing, chat, thanks, admin, and a "states" gallery (edge cases, loading screens, modals). Toggle the **Tweaks** button in the toolbar for live controls (mark variant, chat density, progress style).

Open `canvas.html` for the brand canvas with side-by-side variations and tokens.

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, components, and interaction patterns. The design system is calibrated and ready to ship — copy `tokens.css` directly into the production CSS.

The "kimba twist" relative to the parent V&H brand is intentional and **typographic**, not chromatic:
- Lowercase Archivo headlines (heavyweight, condensed)
- Fraunces serif for AI dialog and lede copy
- JetBrains Mono for `/slash` meta-text
- Same V&H red (#D9181E) accent and same warm cream paper

Do not capitalize Kimba's voice. Do not swap to a different serif. Do not introduce new accent colors.

---

## Surfaces / Views

### 1. Landing — `surfaces/landing.jsx`
**Purpose:** Token-validated entry. Respondent enters name + role, then begins chat.

**Layout:** Single full-bleed column on warm cream. Wordmark top-left, `/operated by verse and hook` mono tag top-right. Hero stack center-left: `/{client-slug}` slash tag, lowercase `kimba.` display headline (Archivo 800, ~88px), serif lede explaining what Kimba is and what's about to happen, identity form (name + role inputs), red "begin →" button. Photo of Kimba (the dog) full-bleed on the right, ~38% of viewport.

**Components:** Wordmark (small), KimbaMark (variant: circle), text inputs, primary red button, mono slash tags.

**Behavior:** On mount → `GET /api/vh-session/{token}`. Valid → render. Invalid/expired/used → render appropriate `TokenError` from `surfaces/states.jsx`. Click begin → save identity → render `BeginTransition` ~600ms → chat.

### 2. Chat — `surfaces/chat.jsx`
**Purpose:** The core conversational intake. Variable-length conversation (5-12 exchanges typical).

**Layout:** Full-viewport flex column. Header bar (~60px): Kimba avatar circle (small photo crop on red), "kimba" + client mode line. Thread area scrolls. Composer pinned to bottom: textarea (autoresize) + red send arrow. Optional progress indicator (top-right of header, dot or bar variants).

**Components:** Message bubbles (AI: serif, no background; User: warm white card with soft shadow), TypingDots (3-dot pulse), ProgressDots/ProgressBar (toggleable via Tweaks), composer with autoresize.

**Density modes:** `comfortable` (default, ~17px serif, 24px gap) and `compact` (~15px, 16px gap). Wire as a CSS variable swap; the prototype toggles via Tweaks.

**Behavior:** Each user reply → `POST /api/chat` with full history. Stream the AI response if backend supports SSE. Watch for `[INTAKE_COMPLETE]` sentinel → advance to thanks. Network failure → render `<NetworkError>` overlay (modal in `states.jsx`); buffer the user's last message client-side and re-POST on retry.

**Mobile:** See "Mobile keyboard spec" below — non-trivial, follow the spec carefully.

### 3. Thanks — `surfaces/thanks.jsx`
**Purpose:** Confirmation + close. Reinforces tone.

**Layout:** Centered single-column on warm cream. Big lowercase "thank you." headline (Archivo, ~96px) with red period. Serif sub: "your voice is part of how altona's identity gets shaped." Mono tag below: `/session complete · transcript saved`. Two ending variants in `canvas.html` — pick one and lock it.

**Behavior:** On render → `POST /api/vh-session/{token}/complete`. Mark token used; refresh shows `used` error.

### 4. Admin — `surfaces/admin.jsx`
**Purpose:** V&H team views all sessions, drills into transcripts, runs alignment analysis.

**Layout:** Two-column. Left sidebar (~260px): wordmark, slash-tagged "/admin", session list with client name + completion fraction, "+ new session" CTA pinned bottom. Right: detail pane with three tabs (overview, transcripts, analysis).
- **Overview:** Metadata grid + completion progress bar.
- **Transcripts:** List of respondents → click to expand into full conversation in a side drawer.
- **Analysis:** 2D quadrant chart with respondents plotted on dimensions surfaced by the LLM. Below: convergence/conflict/outlier narrative cards.

**Components:** All from `components.jsx`. Quadrant chart is custom SVG — see `surfaces/admin.jsx` for layout values (axes labels, point styling).

**Behavior:** All admin endpoints in IMPLEMENTATION.md. Locked state when `completedCount < 2` → render `<AnalysisLocked count={n} />`. New session → modal + `POST /api/admin/sessions`.

### 5. Edge / loading states — `surfaces/states.jsx`
**Prototype-only navigation surface; do not ship.** Each subcomponent is a real screen — wire into the live flow at the trigger points called out in IMPLEMENTATION.md:
- `AdminLogin` — split-screen, photo left, form right
- `BeginTransition` — Kimba mark with pulse ring, "kimba's getting ready." + typing dots
- `TokenError` (kind: `invalid` | `expired` | `used`) — same template, different copy
- `NetworkError` — overlay modal over chat
- `EmptyAdmin` — first-run state for the admin list
- `AnalysisLocked` — inline placeholder where the analysis chart would go
- `NewSessionModal` — two-column dialog with form left, live mode preview right (shows opener prompt for selected mode)
- `RunAnalysisOverlay` — modal with progress bar while LLM analyzes transcripts

---

## Interactions & Behavior

- **Begin transition:** 600–800ms; pulse ring on Kimba mark; segues into first AI message rendering.
- **Send message:** Optimistic UI — user message appears immediately as a card; typing dots appear in next AI slot; AI message streams or appears on response.
- **Progress styles:** `dots` (default) — N circles top-right of chat header, filled = exchange done. `bar` — thin horizontal bar. `none` — hide.
- **Transcript drawer:** Slides in from right, ~480px wide, dim overlay on the rest.
- **Run analysis:** Click button → overlay with progress bar, ~12s simulated. On complete, quadrant chart fades in.
- **No animations longer than 400ms anywhere.** This is a quiet, professional brand — no bounce, no hard easing curves.

---

## State Management

- **Respondent flow** is a finite state machine: `validating → landing → starting → chatting → completing → thanks` with `error` branches off most states.
- **Chat** keeps a message array `{role: 'user'|'assistant', content, ts}` plus `isStreaming` and `pendingRetry` flags.
- **Admin** is conventional: list query + selected session detail query + analysis result cache.
- Use whatever state library nilesheron-web already uses. If none, useState + useReducer is fine — the surfaces are not deeply nested.

---

## Design Tokens

All in `tokens.css`. Drop the `:root { ... }` block into production CSS verbatim.

**Colors:**
- `--kimba-red: #D9181E` — single accent. Use sparingly: primary buttons, the period at end of headlines, slash-tag `/error` lines, locked-state warnings.
- `--kimba-ink: #0D0D0D` — primary text
- `--kimba-ink-2: #3A3A38` — secondary text
- `--kimba-mute: #8E8B83` — meta text
- `--kimba-mute-2: #B5B0A6` — disabled / hint
- `--kimba-paper: #F6F2EC` — main warm cream background
- `--kimba-paper-2: #EFE9DE` — sidebars, section breaks
- `--kimba-white: #FBFAF6` — cards, inputs
- `--kimba-rule: #D9D2C4` — borders
- `--kimba-rule-soft: #E6E0D2` — subtle hover/selected backgrounds

**Type:**
- `--kimba-display: 'Archivo', sans-serif` — weight 800, condensed when available, **always lowercase**
- `--kimba-body: 'Archivo', sans-serif` — weight 400/500
- `--kimba-serif: 'Fraunces', serif` — weight 400, used for AI dialog and lede copy
- `--kimba-mono: 'JetBrains Mono', monospace` — weight 400, used for `/slash` tags only

**Type scale (used):** display 88/64/56/40/36/32/28; body 19/17/15; mono 11.

**Spacing scale:** 4 / 8 / 12 / 16 / 22 / 28 / 36 / 56 (mostly 8-multiples, occasional 22 for asymmetric breathing).

**Radii:** Mostly 0 (sharp). 50% on the Kimba avatar circle. No rounded buttons, no rounded cards.

**Shadows:** One soft shadow on user message bubbles and modals: `0 1px 2px rgba(13,13,13,0.04), 0 8px 24px rgba(13,13,13,0.06)`. That's it.

---

## Assets

`assets/` contains 5 photos of Kimba (the actual dog):
- `kimba-portrait.jpg` — main hero, used on landing right panel
- `kimba-square.jpg` — used in admin login left panel
- `kimba-side.jpg`, `kimba-alt.jpg`, `kimba-hero.jpg` — variants for canvas exploration

These are real photos, not placeholders. Use them in production. Circle-cropped on red for chat avatar; full-bleed on hero panels; square on splash.

**Fonts:** Archivo, Fraunces, JetBrains Mono — all on Google Fonts. Self-host for production or use Google Fonts CDN. Weights needed: Archivo 400/500/800, Fraunces 400, JetBrains Mono 400.

---

## Screenshots

In `screenshots/` for quick visual reference (interactive prototype is the source of truth — open `index.html`):

- `00-brand-canvas.jpg` — top of the brand canvas (open `canvas.html` for the full pannable view)
- `01-landing.jpg` — landing surface, desktop + mobile preview side-by-side
- `02-chat.jpg` — chat surface mid-conversation
- `03-thanks.jpg` — thank-you / completion surface
- `04-admin.jpg` — admin clients list
- `05-states-login.jpg` — admin login screen
- `06-states-newsession.jpg` — new session modal with live mode preview
- `07-states-network-error.jpg` — network error overlay rendered over chat
- `08-states-running-analysis.jpg` — alignment analysis overlay

## Files

- `index.html` — main prototype, surface switcher in top bar
- `canvas.html` — brand canvas with variations (3 mark variants, 3 landing directions, 2 thank-you endings, chat density studies)
- `app.jsx` — surface routing + Tweaks integration
- `components.jsx` — KimbaMark, Wordmark, TypingDots, ProgressDots, ProgressBar, etc.
- `surfaces/landing.jsx` · `surfaces/chat.jsx` · `surfaces/thanks.jsx` · `surfaces/admin.jsx` · `surfaces/states.jsx`
- `tokens.css` — copy this verbatim
- `styles.css` — component styles using tokens (port these patterns to your CSS approach)
- `tweaks-panel.jsx` · `design-canvas.jsx` · `canvas-boards.jsx` — prototype-only scaffolding, ignore for production

**Read `IMPLEMENTATION.md` next.** It's the engineering-side companion to this README — API mappings, mobile keyboard spec, analytics events, URL/token format, and open questions for the V&H team. Self-sufficient enough to drive implementation without further design input.

**Use `PROMPT.md` to drive Claude Code.** It contains the exact prompts to feed Claude Code phase by phase (tokens + landing → chat → thanks → admin → analysis → analytics), plus a "if Claude Code drifts" troubleshooting section.
