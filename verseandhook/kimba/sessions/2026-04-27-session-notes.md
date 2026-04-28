# Kimba Dev Session Notes
**Date:** 2026-04-27
**Branch:** main

---

## What Was Built

### feat: link embedding in new-session modal + modal scroll fix (commit 8ef8e26)
- Modal fix: min-height: 0 on both columns — footer and generate button always reachable
- Attach block: file drop zone default; paste a link → swaps to URL input; switching modes clears other state
- oEmbed/detection: new `/api/vh-link-meta` proxies YouTube + Vimeo oEmbed server-side. Fires 600ms after URL input stops
- Kimba callout: appears below input once file selected or URL detected. Adapts per type: PDF, image, Office, YouTube/Vimeo, Drive, unknown
- Respondent side: YouTube/Vimeo/Drive get correct embed URL; panel label switches to / linked resource; Claude gets intro message as context note in system prompt

### fix: curly quotes breaking login (commit 5cf2842)
- Edit tool wrote 'youtube' using U+2018/U+2019 typographic quotes as JS string delimiters
- Broke entire script block, killed login
- Python script replaced all curly quotes with straight quotes

### fix: modal scroll (commit c7c9ec0)
- Switched modal-inner from CSS grid to flex — flex with max-height correctly constrains children for scroll
- modal-form-col: flex: 1.1, overflow-y: auto
- modal-preview-col: flex: 1, overflow-y: auto
- modal-created: flex: 1 (was grid-column: 1/-1)

### fix: generating state off-center (commit 6e96dfa)
- Phase 2 div wasn't filling modal — added flex:1 + align/justify center

---

## Audit Findings (Supabase transcript review)

**Session reviewed:** custom-d0d245a3 (faves questionnaire with video attachment)

### What worked
- Covered all 9 areas with follow-ups
- Connected Outkast reference to video context (injection worked)
- Voice consistent: lowercase, warm, curious, short questions

### Issues found

**1. Awkward video opener**
Kimba asked "what did you think?" despite opener saying "we're not going to talk about it at all." System prompt had no video instruction — only opener did. Kimba improvised incorrectly.
- Fix: inject into system prompt: if attachment present + intent = discuss → "open with 'let me know when you've finished watching, or if you'd prefer to chat while it plays' and wait before starting questions"
- Default behavior: video is almost always meant to be discussed. Waiting for ready signal is correct default.

**2. Wouldn't accept simple answers**
Coverage rule said "follow up if interesting" — model treats everything as interesting. Needs per-question permission level.
- Fix: question builder tags (simple/complex/number/no-follow-up) replace blanket follow-up rule
- Also: Kimba needs to distinguish dismissive "no" from short-but-complete "that's not important to me"

**3. Wrap-up button appeared mid-interview**
Button shows when exchanges >= max_exchanges. Counter counts turns, not topics. 9 topics easily exceeds default 10 exchanges.
- Fix: wrap-up button should only appear on [CLOSING] signal from Kimba, not when counter expires. Hard limit becomes soft backstop.

**4. Auto-close on [INTAKE_COMPLETE]**
App jumped immediately to thanks screen with no warning. Respondent never saw Kimba's closing message. Especially bad with video still playing.
- Fix: when [INTAKE_COMPLETE] detected, show in-chat gentle overlay: "this conversation is complete — whenever you're ready →" — respondent controls the exit.

**5. [INTAKE_COMPLETE] missed**
Kimba wrote excellent closing content but dropped the token. Generated prompts use single-shot close instruction; base templates use two-step ([CLOSING] → exchange → [INTAKE_COMPLETE]) which is more forgiving.
- Fix: part of broader prompt generation improvements in next phase

---

## Design Decision: New Session Modal Flow

See `Kimba_Admin_Modal_Flow_v1.md` for full flow map (already committed).

**Decisions locked this session:**
- Synthesis: AI pass (not template-driven)
- Question order: drag to reorder  
- Phase 3 (review): survives — AI generates opener, user edits
- Synthesis result shown with chance to edit before final submit
- Question builder moves to its own phase (Phase 2) with tag selectors: simple / complex / number / no-follow-up

**Status:** Flow map approved. Not yet built. See carry prompt.
