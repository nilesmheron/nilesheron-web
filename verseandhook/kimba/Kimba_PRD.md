# Kimba — Product Requirements Document

**Version:** 1.1 (DRAFT)
**Last Updated:** 2026-04-25
**Owner:** Verse and Hook
**Status:** Active — Pre-redesign

---

## Overview

Kimba is an AI-powered conversational intake and extraction tool built for Verse and Hook. It replaces the cold, transactional intake form with a structured conversation — the kind that feels like talking to someone who's actually paying attention. Kimba goes out, fetches what the team needs from clients and stakeholders, and brings it back organized, analyzed, and ready to act on.

The name is the founder's dog. The behavior should match: approachable, eager, focused, and surprisingly effective at getting people to say things they might not have written in a form.

The product is currently functional and living at `verseandhook/intake/` in the `nilesheron-web` repo. This document defines the v1 target state: a renamed, rebranded, fully cohesive product that can be deployed as a standalone tool under the Kimba identity.

---

## Problem Statement

Client intake, brand discovery interviews, and mid-engagement feedback collection are time-intensive, qualitatively inconsistent, and hard to scale. A single project with 20 stakeholders means 20 individual conversations with varying depth, varying formats, and no easy way to surface where those 20 people agree, disagree, or are outliers.

The existing prototype solves the mechanical problem — a token-based chat interface that conducts AI-moderated interviews and stores transcripts. What it doesn't yet have is a product identity, a cohesive visual experience, or an analysis layer sharp enough to be a genuine deliverable.

---

## Target Users

**Primary — Verse and Hook team (admin users)**
The people who configure sessions, generate links, distribute them to client stakeholders, and review results. They need a fast admin interface and analysis they can actually put in front of a client.

**Secondary — Client stakeholders (respondents)**
Anyone from a CMO to a junior brand manager to a founder who gets a Kimba link. They have no prior context about the tool. The experience needs to explain itself, feel credible but not clinical, and respect their time.

---

## Current State (Prototype)

The prototype at `verseandhook/intake/index.html` and `admin.html` covers:

**Client-facing (index.html)**
- Token validation on load — invalid/missing tokens show an error state
- Landing view with client name, session goal badge, and a description
- Identity collection form (name, title, email) before the conversation begins
- Full conversational chat interface powered by Claude Haiku via `/api/chat`
- Three extraction modes with distinct system prompts: Brand Discovery, Project Intake, Engagement Feedback
- Hardcoded opener messages per mode so the first message feels immediate
- Progress bar tied to exchange count
- `[CLOSING]` and `[INTAKE_COMPLETE]` signal tokens in AI responses to trigger end-of-session behavior
- Skip-to-complete option when AI reaches closing phase
- Thank you page on submission

**Admin (admin.html)**
- Password-protected login with session token stored in sessionStorage
- Client list dashboard showing name, goal, response count, last response date
- New client modal: name + extraction goal → generates tokenized shareable link
- Client detail view: respondent list with expandable transcripts
- Alignment analysis panel: score bars per dimension + narrative text
- Analysis gated behind response count (requires 2+ responses)

**What's missing:**
- Kimba brand identity — name, visual system, Kimba illustration asset
- Cohesive UX across all three client screens (landing, chat, thank you)
- Design system with Kimba-specific tokens (colors, type, illustration/icon language)
- Admin analysis is functional but spartan — not presentable to a client as-is
- No multi-recipient flow (link works for one respondent at a time; bulk distribution is manual)
- No session status indicators (how many of 20 stakeholders have completed)
- No export layer (transcripts and analysis live in the UI with no PDF/CSV path)
- Branding reads as Verse and Hook internal tooling, not a product

---

## Product Rename and Identity

The tool is being renamed **Kimba**. The name is not a reference to any IP — it's the founder's dog, and the origin story is the brand: a real dog, with a real look, used as a real visual asset in the product.

**Brand direction:**

The visual anchor is an illustration of Kimba — the actual dog. This is not a generic "dog as metaphor" approach. The product has a specific character asset, and that asset should appear intentionally across the client experience: on the landing page, likely on the thank you screen, possibly as the typing indicator in the chat. The illustration style should be determined once reference photos are available, but the direction is warm and characterful without being cartoonish or childlike — think editorial illustration, not app store icon.

What the dog visual does for the product: it gives Kimba a face. Respondents aren't filling out a form for a faceless tool. They're talking to something. The illustration is the warmth anchor; the rest of the design can be as clean and professional as it needs to be.

The interaction language does not need to "act like a dog" — that framing is off the table. Kimba doesn't fetch in the copy, doesn't bark, doesn't wag. The product is named after the dog. The dog appears in the design. That's the extent of the metaphor.

Additional brand parameters:
- Lighthearted but precise. Copy should feel like a person, not a chatbot.
- Color palette should feel distinct from Verse and Hook's own identity — Kimba is a product, not a sub-brand. The palette should be warm enough to carry the illustration without competing with it.
- Typography: a display face with character paired with a readable body font. Fraunces/Inter is a reasonable starting point and consistent with V&H's broader aesthetic — worth evaluating whether Kimba gets its own type treatment or inherits from V&H intentionally.
- Generic dog iconography (paw prints, bones, emoji) is off the table. The actual Kimba illustration is the only dog element.

---

## Product Surfaces

### Surface 1 — Splash / Landing Page

This is the first thing a respondent sees after clicking their tokenized link. It needs to do three things immediately: explain what this is, establish why it's worth their time, and remove friction to starting.

**Requirements:**
- Display the client name and session goal prominently
- One-paragraph explanation of what the conversation is and how long it takes (10–15 minutes)
- Kimba branding visible — this should feel like a product, not a raw HTML page
- Single primary CTA: Begin
- The V&H attribution should be present but secondary — this is Kimba's experience, Verse and Hook is the operator
- No login, no account, no friction before the identity form
- Error state for invalid/expired tokens should feel handled, not broken

**Copy direction:**
The landing copy should be brief and direct. Something in the register of: "We're collecting perspectives from a few key people on [Client]. This conversation takes about 10 minutes. There are no right answers — we're just here to understand how you see things." The exact copy will vary by extraction mode.

**Design notes:**
- Full-bleed, centered layout
- The session goal badge (Brand Discovery / Project Intake / Engagement Feedback) should be the first contextual element visible
- Generous whitespace — this screen should breathe
- Mobile-first; many respondents will open this on their phones

---

### Surface 2 — Identity Collection

Simple form before the conversation begins. Name, title, email. This screen exists for attribution — the team needs to know who said what when reviewing transcripts.

**Requirements:**
- Clear explanation of why this info is being collected (attribution, not spam)
- Standard validation with readable error states
- The transition from this screen into the chat should feel intentional — not just a page swap

**Note:** Consider whether the identity form can be folded into the landing screen rather than being a separate view. Two taps to get to a conversation is better than three.

---

### Surface 3 — Chat Experience

The core of the product. This is where Kimba earns its reputation.

**Requirements:**
- AI message display should feel conversational and unhurried — Fraunces or equivalent serif for AI text is the right instinct, creates distance from a generic chatbot
- User messages visually distinct but not elevated — they're the input, not the output
- One-question-at-a-time pacing is a product behavior, not just a prompt instruction. The UI should reinforce this — no chat history clutter, just the current exchange foregrounded
- Progress indicator should communicate "you're getting there" without making the conversation feel like a form with a progress bar. The current bottom-fixed bar is functional; consider whether it fits the Kimba identity or whether a softer indicator (e.g., a small dot sequence, a subtle top indicator) serves better
- The "Nothing to add" skip button during closing should feel warm, not dismissive — copy matters here
- Typing indicator (dots) should be present and felt — the pause before Kimba's response is part of the attentiveness quality
- Input area should feel lightweight — the respondent should feel like they're in conversation, not filing a report
- Mobile keyboard behavior needs explicit attention: the input area must stay above the keyboard, the chat should scroll correctly

**Copy for the AI identity label:**
Currently reads "Verse & Hook" in the prototype. In Kimba, this should read "Kimba" — the product is the interviewer, not the agency.

---

### Surface 4 — Thank You Page

The closing screen. It's the last thing the respondent sees and the first thing they'll remember about the experience.

**Requirements:**
- Acknowledge that their time mattered — warm, not effusive
- Brief explanation of what happens next ("The Verse and Hook team will review your responses as part of their work with [Client]")
- Kimba mark or wordmark visible — this is a brand moment
- No CTA, no links, no upsell — this screen earns trust by not asking for anything else
- Mobile-appropriate — clean, centered, complete

**Current state:** "Thank you for your time. Your responses have been recorded. The Verse and Hook team will review them as part of the onboarding process." This is fine copy but the screen is stark. The v1 design should make this feel like a considered ending, not a receipt.

---

### Surface 5 — Admin Panel

The admin panel is internal tooling. It does not need the full Kimba client experience — it needs to be fast, clear, and functional. The design should share the Kimba token system (colors, type) but the UX priority is efficiency for the V&H team, not warmth for an external respondent.

**Current capabilities to preserve:**
- Client list with goal badge, response count, last response date
- New client modal: name, extraction goal, link generation + copy
- Client detail: respondent list with transcript access
- Alignment analysis panel

**V1 improvements (prioritized):**

*High priority:*
- Session status indicator — when a client session has multiple expected respondents, the admin needs to see completion rate (e.g., 7 of 20 completed). This requires an expected_respondent_count field at session creation.
- Analysis polish — the current score bar + narrative format is the right structure, but the narrative needs to be exportable and the scores need context (what do the dimensions mean, what does a score of 62 actually indicate)
- Copy link UX — the current flow generates a link in a modal. It works. But when distributing to 20 stakeholders, this needs to be more efficient. See future features.

*Medium priority:*
- Extraction mode preview — when creating a new session, the admin should be able to see a summary of what the AI will cover in that mode, so they're not flying blind when explaining it to a client
- Response timestamps and duration — knowing that 12 of 15 respondents took less than 8 minutes is a data point worth having
- Simple search/filter on the client list when it grows past 10–15 entries

*Lower priority for v1:*
- Role-based access (multiple team members with different views)
- Client-facing analysis output (a shareable summary that V&H can send to the client)

---

## Analysis Layer

The analysis feature is what makes Kimba more than a transcript repository. When two or more respondents complete a session, the system runs alignment analysis across their transcripts.

**Current output:**
- Dimensional scores (e.g., brand_clarity, audience_alignment, competitive_awareness) as a 0–100 value with a bar visualization
- A narrative summary paragraph
- Timestamp of last analysis run

**V1 target output:**
The scoring model should surface three categories explicitly in the UI:

*Alignment* — Where respondents converge. High agreement on a dimension. The narrative should name the specific point of convergence, not just report the score.

*Conflict* — Where respondents materially disagree. Low alignment score with meaningful variance between individual responses. The narrative should note the nature of the disagreement without attributing it to specific respondents (no "the CMO said X while the founder said Y" — keep it thematic).

*Outlier responses* — Where a single respondent diverged significantly from the group. Useful for identifying knowledge gaps, misalignment between levels of an org, or a perspective the brand hasn't fully internalized. Outliers are not bad — they're signal.

**Analysis trigger:**
Currently, analysis appears to run at some interval or on-demand. V1 should make this explicit: a "Run analysis" button in the admin panel, with a timestamp of the last run. Auto-run can come later.

**Minimum response threshold:**
Two responses required for basic alignment. Five or more required for outlier detection to be meaningful. The UI should communicate this clearly when viewing sessions with fewer responses.

---

## Technical Constraints and Notes

- The current prototype is static HTML with API calls to Vercel edge functions (`/api/chat`, `/api/vh-session`, `/api/vh-response`, `/api/vh-admin`, `/api/vh-auth`). The Kimba v1 redesign should not require changes to API contracts — it's a frontend and identity upgrade, not a backend rebuild.
- Claude Haiku (`claude-haiku-4-5-20251001`) is the current model. This is appropriate for the conversational use case. The system prompts are well-constructed and should be preserved with minimal changes for v1. The AI identity label change (from "Verse & Hook" to "Kimba") is a frontend change only.
- Token-based session management is correct and should be preserved. Future multi-user flows (see below) will extend this, not replace it.
- The extraction mode system prompts are hardcoded in the frontend JS object `INTAKE_SYS`. For v1, this is fine. Future versions should consider moving these server-side so they can be customized per session without a code deploy.
- Mobile is a first-class requirement. Respondents receiving a link via email or Slack will frequently open it on their phones. The current prototype has basic responsive CSS but has not been tested for mobile keyboard interaction in the chat view.

---

## Future Features (Out of Scope for V1)

**Multi-user distribution (v2)**
Rather than manually generating and sending individual links, the admin should be able to enter a list of email addresses at session creation and have Kimba send the tokenized links automatically. Each respondent gets a unique token; the admin sees completion status per respondent. This is the feature that makes a 20-stakeholder brand discovery exercise operationally feasible.

**Custom extraction modes (v2)**
The three hardcoded modes (Brand Discovery, Project Intake, Engagement Feedback) cover the V&H use case well. As Kimba grows, admins should be able to define custom question areas and conversation goals without a code change.

**Client-facing analysis deliverable (v2)**
A shareable, polished summary of the alignment analysis that V&H can send directly to the client. This is a real product feature — a Kimba-branded PDF or web view that the client actually receives as a deliverable.

**Session templates (v3)**
Pre-configured sessions that V&H has tuned for specific project types, with saved system prompt variations, recommended respondent counts, and suggested distribution lists.

---

## Success Criteria for V1

The v1 redesign is successful if:

- A client stakeholder who receives a Kimba link can complete the conversation on mobile without friction or confusion
- The Kimba brand identity is distinct, coherent, and carries through all three client surfaces (landing, chat, thank you)
- The V&H team can create a new client session, distribute the link, and pull analysis without needing to explain what the tool is or how it works
- The alignment analysis output is clear enough to include in a client-facing document without additional interpretation
- No one who completes a Kimba interview describes it as "filling out a form"
