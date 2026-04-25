# Prompts for Claude Code — Kimba implementation

Use these prompts in order. Stop and review after each phase before continuing. Don't paste them all at once.

---

## Before you start (one-time, in Claude Code)

Open Claude Code in `dev/nilesheron-web/verseandhook/`. Then:

> Read `design_handoff_kimba/README.md` and `design_handoff_kimba/IMPLEMENTATION.md` end to end. Then explore the existing `verseandhook/intake/` route to learn this codebase's conventions: routing, API client, CSS approach, auth. Don't write any code yet. Once you've done both, summarize:
> 1. What patterns in `intake/` you'll match for Kimba (file structure, routing, styling)
> 2. What's missing or unclear before you can start phase 1
> 3. Any conflicts between the design spec and existing patterns
>
> Wait for my go before phase 1.

This is the most important prompt. If Claude Code skips this and starts coding, stop it and re-anchor.

---

## Phase 1 — Tokens + landing surface

> Implement phase 1: design tokens + landing surface only.
>
> 1. Copy the `:root { ... }` block from `design_handoff_kimba/tokens.css` into the production CSS verbatim. Don't rename variables. Don't change values.
> 2. Add the three Google Fonts (Archivo 400/500/800, Fraunces 400, JetBrains Mono 400) using whatever approach this codebase already uses for fonts.
> 3. Build the landing surface as a new route. Match the visual design in `screenshots/01-landing.jpg` and `surfaces/landing.jsx`. Recreate the layout in this codebase's framework — don't copy the JSX.
> 4. Wire up real token validation against the existing intake API:
>    - On mount, validate the token from the URL.
>    - Valid → render the form.
>    - Invalid / expired / used → render the appropriate `TokenError` variant from `surfaces/states.jsx` (recreated in this codebase's framework).
> 5. The "begin" button should call the existing session-start endpoint and route to a placeholder `/chat` page.
>
> Don't build chat, thanks, admin, or states beyond what's needed for routing. Don't add the Tweaks panel — that's prototype-only scaffolding.
>
> When done: show me the new files, the screenshots compared to the prototype, and any deviations you had to make to fit existing patterns.

---

## Phase 2 — Chat surface

> Implement phase 2: chat surface.
>
> 1. Build the chat layout per `screenshots/02-chat.jpg` and `surfaces/chat.jsx`. Header bar, scrolling thread, pinned composer.
> 2. Wire `POST /api/chat` per the existing convention in this codebase (look at how `intake/` handles streaming if it does).
> 3. Implement the mobile keyboard spec exactly as written in `IMPLEMENTATION.md`. Use the visual viewport API approach. Do not use `scrollIntoView`. Do not use `position: fixed` on the composer without dvh fallback.
> 4. Watch for the `[INTAKE_COMPLETE]` sentinel in AI output and route to a placeholder `/thanks` page when it fires.
> 5. Build the typing-dots and progress-dots components (see `components.jsx` for the pattern; rebuild in this framework).
> 6. Wire the `NetworkError` overlay (from `surfaces/states.jsx`, screenshot `07-states-network-error.jpg`) to fire on fetch failure. Buffer the user's last message client-side and re-POST on retry.
>
> Don't build admin yet. Don't ship the prototype's density toggle (lock to `comfortable`).
>
> When done: test on iOS Safari and Chrome Android specifically — the keyboard behavior must match the acceptance criteria in `IMPLEMENTATION.md`. Send me a screen recording of mobile keyboard open/close + send-message in both browsers.

---

## Phase 3 — Thanks + completion

> Implement phase 3: thanks surface.
>
> Quick one. Build the thanks page per `screenshots/03-thanks.jpg` and `surfaces/thanks.jsx`. On render, call the session-complete endpoint to mark the token used. Pick one of the two ending variants from `canvas.html` and lock it (don't ship both).

---

## Phase 4 — Admin (auth + list + detail)

> Implement phase 4: admin — login, list, and detail views (no analysis yet).
>
> 1. Build the admin login screen per `screenshots/05-states-login.jpg` and the `AdminLogin` component in `surfaces/states.jsx`. Use whatever auth model this codebase already has — if there's a pattern, match it. If there isn't, password env var + httpOnly cookie session is fine.
> 2. Build the admin clients list per `screenshots/04-admin.jsx` and `surfaces/admin.jsx`. Empty state per the `EmptyAdmin` component (screenshot in the gallery).
> 3. Build the session detail view: overview tab + transcripts tab. Drawer that slides in to show full transcripts.
> 4. Build the new-session modal per `screenshots/06-states-newsession.jpg` and the `NewSessionModal` component. Hook it up to `POST /api/admin/sessions`. After successful create, show a toast + copyable link inside the modal (not designed in the prototype — your call on UX, but keep it minimal).
>
> Don't build the analysis tab yet — that's phase 5. Show me the work before continuing.

---

## Phase 5 — Analysis

> Implement phase 5: alignment analysis.
>
> 1. Build the analysis tab in admin session detail. Locked state when `completedCount < 2` per `AnalysisLocked` component.
> 2. Wire `POST /api/admin/sessions/{id}/analyze` with the running-analysis overlay per `screenshots/08-states-running-analysis.jpg` and `RunAnalysisOverlay` component.
> 3. Build the 2D quadrant chart with respondents plotted on dimension axes. Match the structure in `surfaces/admin.jsx` — custom SVG, not a chart library, since the styling is specific.
> 4. Render convergence / conflict / outlier narrative cards below the chart.
>
> The LLM-generated narrative copy in the prototype is fabricated. Use the real analysis output from the API.

---

## Phase 6 — Analytics + polish

> Implement phase 6: analytics events + final polish.
>
> 1. Instrument the funnel events listed in `IMPLEMENTATION.md` (`session.landed`, `session.started`, etc.). POST them to `/api/track` (create the route if it doesn't exist).
> 2. Compute and persist the quality metrics on session completion.
> 3. Cross-browser pass: Safari 15+, Chrome Android, in-app browsers (Instagram, Slack, X). Test the chat surface specifically.
> 4. Accessibility pass: tab order, focus states, color contrast. Don't change visual design — work within the design spec.
>
> Don't add a separate analytics dashboard yet — that's a v2.

---

## If Claude Code drifts

Common failure modes and how to push back:

- **Capitalizes Kimba's voice** ("Hey — I'm Kimba.") → "Lowercase only. Per README. Re-read the typography section."
- **Swaps the serif** to Lora, Source Serif, or PT Serif → "Fraunces only. Per tokens.css."
- **Adds extra accent colors** (greens, blues for success/info states) → "Single accent: V&H red. Use ink/mute for state variation. Per README."
- **Uses `scrollIntoView` for chat scrolling** → "Per `IMPLEMENTATION.md` mobile keyboard spec, use `el.scrollTo({ top: el.scrollHeight })`. Never `scrollIntoView`."
- **Builds all 5 surfaces in one PR** → "Stop. Phase 1 only. Per `PROMPT.md`."
- **Adds rounded corners to buttons or cards** → "Sharp corners only. Radius is 0 except the Kimba avatar circle. Per README."
- **Tries to ship the Tweaks panel** → "Prototype-only scaffolding. Don't port."
- **Invents copy for Project Intake or Engagement Feedback openers** → "Leave as TODO. The user said copy is being addressed separately."

---

## After all phases

> Open a PR with the full implementation. In the PR description:
> 1. Link each phase to its commits.
> 2. List any deviations from the design spec and why.
> 3. Flag the open questions from `IMPLEMENTATION.md` that still need V&H input.
> 4. Attach a screen recording of the full respondent flow (landing → chat → thanks) on mobile and desktop.
