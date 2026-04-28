# Kimba Carry Prompt
**For:** Next Claude Code session
**Date generated:** 2026-04-27

---

## Context

You are continuing development on Kimba — an AI-powered conversational intake tool for Verse and Hook. The codebase is at `nilesmheron/nilesheron-web`, Vercel-deployed at `dev.nilesheron.com`. Relevant files:

- `verseandhook/intake/admin.html` — admin panel (currently active, being redesigned)
- `verseandhook/kimba/index.html` — respondent-facing chat experience
- `api/vh-admin.js` — server actions: generate_prompt, create_session, get_sessions, get_responses, analyze_responses
- `api/vh-link-meta.js` — oEmbed proxy for YouTube/Vimeo (just built)
- `verseandhook/kimba/Kimba_Admin_Modal_Flow_v1.md` — approved flow map for new session modal
- `verseandhook/kimba/sessions/2026-04-27-session-notes.md` — full session log

---

## What Was Just Deployed

Link embedding in the new-session modal is live. Modal scroll is fixed. Admin login is working (was briefly broken by curly quote bug in JS — fixed).

---

## What Needs to Be Built Next

Three separate workstreams. Assess which to tackle first:

---

### Workstream A: New Session Modal Redesign

Full flow map is approved and committed at `verseandhook/kimba/Kimba_Admin_Modal_Flow_v1.md`. Build it.

Summary of changes:
- Phase 1 simplified: remove opening line field, remove max exchanges field, rename goal field to "what's our goal here?"
- New Loading A state: "building your prompt and questions…"
- New Phase 2: split view — left: editable base prompt (AI-generated); right: question builder (draggable list, 5 slots default, tag selector per question: simple/complex/number/no-follow-up, + add question, auto-calculated exchange count)
- New Loading B state: "merging questions into your prompt…"
- Phase 3 updated: opener moves here (AI-generated, editable); rest unchanged
- `vh-admin.js`: extend `generate_prompt` to return suggested questions + tags + recommended exchange count; add new `synthesize_prompt` action (base prompt + ordered question list + tags → full merged system prompt)

Exchange formula: no-follow-up=1, simple=2, number=2, complex=4, plus 4 buffer.

Synthesis per tag:
- simple: "ask once, accept any answer, move on"
- complex: "spend 2-3 exchanges, follow up if interesting"
- number: "get a specific figure, brief follow-up if needed"
- no-follow-up: "ask once, take whatever they give, move on immediately"

---

### Workstream B: Respondent UX Fixes

Four issues found in live transcript audit. Priority order:

**B1 — Soft close instead of auto-close (highest impact)**
File: `verseandhook/kimba/index.html`
When `[INTAKE_COMPLETE]` is detected in Kimba's response, do NOT call `show('thanks')` immediately. Instead: render a gentle in-chat message (styled differently from normal messages) — something like "we're all done here — take your time, and close when you're ready" — followed by an "end conversation →" button. Button triggers `show('thanks')` and `submitIntake()`. Chat stays open, video keeps playing, respondent controls exit.

**B2 — Video attachment: wait for ready signal**
File: `verseandhook/kimba/index.html` + `api/vh-admin.js`
Default assumption: video is always something to be discussed (not background).
When a video URL is attached to a session, inject into the system prompt: "the respondent can see the video. open with: 'let me know when you've finished watching, or if you'd prefer to chat while it plays' — wait for their signal before asking your first question."
Do not ask about the video before they've signaled readiness.

**B3 — Wrap-up button only on [CLOSING]**
File: `verseandhook/kimba/index.html`
Currently: wrap-up button appears when `exchanges >= max_exchanges`. Problem: count-based trigger fires mid-interview on longer sessions.
Fix: remove the exchange-count trigger. Wrap-up button only appears when Kimba sends `[CLOSING]` in its response. Hard exchange limit stays as a soft backstop but doesn't surface UI.

**B4 — [INTAKE_COMPLETE] token reliability**
File: `api/vh-admin.js` (prompt generation)
Generated prompts use a single-shot close instruction that Kimba drops. Add explicit two-step close to all generated prompts: first send `[CLOSING]` on its own line to surface the wrap-up option, then after final exchange send `[INTAKE_COMPLETE]` on its own line. Mirror the discipline in the base templates.

---

### Workstream C: Simple Answer Handling (design decision pending)

Not ready to build. Background for when it comes up:

Kimba currently treats everything as interesting and follows up regardless of whether an answer is complete. The question builder tags (Workstream A) partially address this by giving per-question permission levels. But Kimba also needs to be able to distinguish:
- Dismissive closure: "no" / "I don't know" → one light follow-up is appropriate
- Short but complete: "that's not important to me" → accept and move on

This is a prompt instruction problem, not structural. The tag system from Workstream A sets the permission level; the prompt needs language that helps Kimba read intent. Revisit after A is built.

---

## How to Start

Read the flow map at `verseandhook/kimba/Kimba_Admin_Modal_Flow_v1.md` before touching any code. That's the source of truth for Workstream A.

For B1, find the `[INTAKE_COMPLETE]` handler in `verseandhook/kimba/index.html` (search for `INTAKE_COMPLETE` or `submitIntake`) and replace the immediate redirect with the soft close pattern.

Syntax check every admin.html edit before committing — the file is large and the curly quote bug from last session took time to find. Run: `node -e "const fs = require('fs'); const html = fs.readFileSync('verseandhook/intake/admin.html','utf8'); const m = html.match(/<script[^>]*>([\\.\\s\\S]*?)<\\/script>/g); ..."` or equivalent.
