# PRD: Task Card Behavior Enhancements

**Project:** niles-task-dashboard (tasks.nilesheron.com)
**Version:** 1.0 (DRAFT)
**Last Updated:** 2026-04-18 UTC
**Owner:** Niles Heron
**Target Consumer:** Claude Code — implementation scaffolding
**Repo (source of truth for related files):** `nilesmheron/niles-ai-management`

---

## 1. Summary

This PRD changes the default behavior of task cards in niles-task-dashboard across ten interrelated areas: collaborative review, attribution, attachment handling, rendering, context management, notifications, search, archival, export, and mobile behavior. It also introduces a new first-class object on cards: synthesized prompts.

The core theme is removing friction from async multi-stakeholder review while preserving attribution, versioning, and context fidelity. Collaborators currently added to a card must "create a new review" to contribute; after this change, review is the default mode and review contributions are tagged, threaded, and clarified by Haiku automatically.

---

## 2. Execution Parameters

**Recommended model:** `opusplan` alias in Claude Code. Rationale: implementation involves architectural decisions (notification dispatch layer, context compaction strategy, attachment versioning) that warrant Opus-tier reasoning during planning, with Sonnet-tier sufficient for routine execution once specs are clear. `opusplan` auto-switches between them.

**Override guidance:** The model recommendation above is not a lock. At session start, `/model` can override based on task complexity. Well-scoped discrete features (e.g. file format validation, export scope toggles) are fine on Sonnet alone.

**Claude Code version:** Current stable (`claude --version` to verify; `claude update` if needed).

**Scaffolding note:** Where feature behavior depends on unresolved specifics (flagged in Section 9), Claude Code should surface the question rather than pick silently. This PRD is explicit about what it does not decide.

---

## 3. Scope and Non-Goals

### In Scope (v1)

Ten feature areas and one new object:

1. Collaborator review model (remove "create new review" gate)
2. Attribution in Haiku chat (display-layer)
3. Haiku parsing of attachments and links
4. Tiered iframe rendering
5. Approved file format whitelist with formatted markdown rendering
6. Attachment mechanisms (formal button, paste-to-attach, new-task-creation multi-attach)
7. Attachment version threading
8. Sensitivity tagging (attachment-level visibility)
9. Context management (commit + compact)
10. In-app notification system with pluggable dispatch
11. Search across card chats
12. Card archival (manual + auto)
13. Export (markdown, PDF, clipboard)
14. Mobile behavior
15. Synthesize Prompt (new first-class card object)

### Non-Goals (v1)

Explicitly excluded from this release to prevent scope creep during implementation:

- Role-aware Haiku context (Haiku does not carry collaborator identity or role into its generation context; attribution is display-only)
- Connector-backed fetch for Notion, private GitHub, or platforms beyond Google Drive
- Full-text search inside parsed attachment contents (search covers chat, comments, review notes, synthesized prompts only in v1)
- Content-aware attachment version detection (filename match and explicit "upload new version" action are the only triggers)
- Push notifications, email routing, or Slack mirroring (architected for but not implemented in v1)
- Drag-and-drop on mobile
- Multi-attachment at new-task-creation on mobile
- Request Changes as a distinct review state
- Card-level or project-level approval as a hard gate on workflow progression

---

## 4. Feature Specifications

### 4.1 Collaborator Review Model

**Behavior.** Any user added to a card as a collaborator can contribute review notes by default. The existing "create new review" gate is removed. Review contributions take one of two states:

- **Comment** (default): a note, question, or observation. Haiku responds inline with a mirror restatement for fidelity confirmation. The commenter can confirm, correct, or refine.
- **Approve**: a soft signal that the user is good to proceed. Not a workflow gate. Does not block or advance card state on its own.

Approvals and comments both persist. The card header surfaces aggregate counts (e.g. "3 comments, 2 approvals") at a glance.

**Haiku mirror mechanic.** On each new Comment submission, the system dispatches a Haiku call with the comment text and the current card context. Haiku returns a restatement formatted as "To confirm I've captured this: [restatement]. Is that right?" The restatement posts as an attributed Haiku message immediately below the comment. The commenter sees confirm/refine affordances.

**Data model implications.**

```
review_contribution {
  id: uuid
  card_id: uuid
  author_id: uuid
  author_role_at_submission: enum(owner, collaborator)
  type: enum(comment, approve)
  body: text (nullable for approvals)
  attachment_id: uuid (nullable — see 4.7 for threading)
  attachment_version_id: uuid (nullable)
  created_at: timestamp
  haiku_mirror_id: uuid (nullable, points to generated mirror message)
  mirror_confirmed: boolean (nullable)
}
```

**Acceptance criteria.**

- New collaborator added to card sees existing comments and can contribute without additional action.
- Comment submission triggers Haiku mirror within 3 seconds under normal load.
- Approval submission is atomic — no intermediate "pending" state.
- Card header count reflects current state accurately on page load and after each new contribution.

---

### 4.2 Attribution in Haiku Chat

**Behavior.** Every message in the Haiku chat pane displays the author's name and avatar. This applies to human messages, Haiku responses, and Haiku mirror messages. Haiku messages are tagged as "Haiku" with a distinct visual treatment (e.g. different avatar, subtle background shade) to distinguish AI-generated content from human contributions.

Haiku does not receive user identity in its generation context. Multi-user chats appear to Haiku as an undifferentiated conversation. This is intentional — see Non-Goals.

**Data model implications.** Each chat message carries `author_id` (foreign key to user or system user "Haiku"). Attribution is a render-time concern, not a generation-time concern.

**Acceptance criteria.**

- Every message renders with author attribution visible without hover.
- Haiku messages are visually distinct from human messages.
- No user identity is passed into Haiku's `system` or `user` content blocks in API calls.

---

### 4.3 Haiku Parsing of Attachments and Links

**Behavior.** Haiku's generation context for card-level chat includes parsed content from:

- **Uploaded files** in approved formats (see 4.5). Parsed on upload, cached. Always available.
- **Public external links.** Fetched and parsed on link attachment. If the fetch returns a login wall or 4xx/5xx response, parse fails gracefully and the UI shows "Haiku could not read this link."
- **Self-hosted links** (domains in the iframe allowlist, see 4.4). Fetched server-side with appropriate auth context.

**Connector-backed fetch (future).** The architecture must accommodate future connector-backed parsing for gated external content. Google Drive is the planned first connector. Build the parse layer with a pluggable fetch interface so adding Drive later does not require refactoring.

**UI disclaimer.** Link attachment UI includes a visible note: "Haiku will reference uploaded files reliably. External link access may vary."

**Parsed context budget.** Parsed attachment content counts against the 80K token threshold defined in 4.9. Current version only is parsed per attachment (see 4.7).

**Acceptance criteria.**

- Uploaded file in any approved format is parsable by Haiku within 10 seconds of upload.
- Public link that returns HTML or PDF parses successfully and is referenced in Haiku responses.
- Failed parse does not block chat functionality; user sees clear error state.
- No user intervention required to enable parsing for default cases.

---

### 4.4 Tiered Iframe Rendering

**Behavior.** Attachments render in an iframe inside the task card according to three tiers:

**Tier 1 — Guaranteed render.**
- Uploaded files in approved formats.
- Links to domains in the self-hosted allowlist.

Allowlist is **config-driven**, not hardcoded. Initial entries: `nilesheron.com`, `dev.nilesheron.com`, `tasks.nilesheron.com`, and all subdomains of `nilesheron.com`. Adding a new domain requires a config update, not a code change.

**Tier 2 — Graceful fallback.**
- External links to domains not in the allowlist.
- The system attempts `X-Frame-Options` and `Content-Security-Policy` pre-check where possible. Where embed is blocked, the UI renders an Open Graph preview card with title, description, thumbnail, favicon, and a prominent "Open in new tab" button.

**Tier 3 — Deferred to post-v1.** Connector-backed render for gated content.

**Rendering detail: Markdown.** `.md` files render with full markdown formatting applied — headings, bold, italics, lists, code blocks, links. Not raw text.

**Acceptance criteria.**

- Uploaded PDF, DOCX, PPTX, XLSX, JPG, PNG render inline in iframe without manual action.
- Link to a self-hosted page (e.g. `dev.nilesheron.com/tbp/curriculum-calendar`) renders inline.
- Link to a Tier 2 external site displays Open Graph preview card, not broken iframe.
- Allowlist is editable via config file (path to be determined by Claude Code during scaffolding; flag in Section 9).

---

### 4.5 Approved File Formats

**Whitelist.**

| Extension | Render behavior |
|-----------|-----------------|
| `.md` | Formatted markdown |
| `.docx` | Native iframe render |
| `.pdf` | Native iframe render |
| `.jpg` / `.jpeg` | Inline image |
| `.png` | Inline image |
| `.pptx` | Native iframe render |
| `.xlsx` | Native iframe render |
| `.csv` | Tabular render (basic, not full spreadsheet) |

**Behavior.** Upload of any file outside the whitelist is rejected with a clear error: "File type not supported. Supported formats: [list]." No silent drop, no degraded fallback.

**Acceptance criteria.**

- Attempted upload of unsupported format (e.g. `.zip`, `.mov`) returns error immediately at upload, not after processing.
- All whitelisted formats render as specified.
- Markdown renders formatted, matching the styling of the rest of the app.

---

### 4.6 Attachment Mechanisms

Three mechanisms for adding attachments, each with distinct behavior:

**Formal Attach button.** Present on card body. Opens a menu with two options: "Upload File" (filesystem picker) or "Attach Link" (URL input). All attachments added via this button are **card-level** — visible in the card's attachment rail, accessible to all collaborators (subject to sensitivity tagging, see 4.8).

**Paste-to-attach in comments.** When a user pastes a URL into the comment composition field, the system auto-detects the URL and renders an inline affordance: "Attach this link?" A single click confirms attachment at **comment-level** — the link lives within the comment thread, not in the card's attachment rail.

Each comment-level attachment has a "Promote to card attachment" action available to any collaborator. Promotion moves the attachment to card-level visibility and preserves the comment-level reference.

**New-task-creation multi-attachment.** The new-task form includes an attachment field supporting multiple attachments at creation time. All attachments created here are card-level. Mobile version of the form supports single-attachment-at-creation only; additional attachments can be added post-creation.

**Data model implications.**

```
attachment {
  id: uuid
  card_id: uuid
  scope: enum(card, comment)
  comment_id: uuid (nullable, required if scope=comment)
  source: enum(upload, link)
  visibility: enum(all_collaborators, owners_only)
  created_by: user_id
  created_at: timestamp
  file_metadata: jsonb (filename, size, mime_type for uploads; url, og_metadata for links)
}

attachment_version {
  id: uuid
  attachment_id: uuid
  version_number: integer
  uploaded_by: user_id
  uploaded_at: timestamp
  file_blob_ref: string
  is_current: boolean
}
```

**Acceptance criteria.**

- Formal Attach button creates card-level attachment visible in rail.
- URL paste in comment field triggers auto-detect and attach prompt within 500ms.
- Comment-level attachment has visible "Promote to card" affordance.
- New task form accepts 0..N attachments at creation on desktop; 0..1 on mobile.

---

### 4.7 Attachment Version Threading

**Trigger conditions for threading.** A new upload is treated as a new version of an existing attachment when either:

1. **Filename match**: the uploaded file's name matches an existing attachment's filename on the same card exactly.
2. **Explicit action**: the user selects "Upload new version" from an existing attachment's menu, then uploads a file. The filename can differ.

If neither condition is met, the upload creates a new attachment.

**Version history.** Each attachment displays current version inline. A small affordance ("3 versions") expands to show full version history with timestamp and uploader for each version. Each version has its own thread of review contributions (comments and approvals). Prior review notes persist against their version.

**Haiku parsing behavior.** By default, Haiku parses only the current version of each attachment. A user can invoke "Compare versions" on an attachment, which triggers Haiku to pull specified prior versions into context on-demand for the next response only. The comparison context is not persisted beyond that turn.

**State transitions.**

```
upload received →
  if filename matches existing attachment on card:
    create attachment_version {attachment_id: existing, version_number: prev+1, is_current: true}
    set all prior versions is_current: false
  elif user invoked "upload new version" action:
    create attachment_version under specified attachment_id
  else:
    create new attachment + attachment_version {version_number: 1}
```

**Acceptance criteria.**

- Re-upload with identical filename threads to existing attachment.
- Explicit "upload new version" action threads regardless of filename.
- Version history displays chronologically with attribution.
- Haiku parse scope matches current version by default; compare-versions action works on explicit invocation only.

---

### 4.8 Sensitivity Tagging

**Visibility model.** Each attachment has a visibility flag:

- **All Collaborators** (default): visible to all users with card access.
- **Owners Only**: visible only to users with owner role on the card.

Visibility is set at attachment creation and editable by any owner of the card at any time.

**Multi-owner support.** Each card has 1..N owners. Any existing owner can add or remove other owners. The card creator is the initial owner. Removing the last owner is not allowed; the action returns an error.

**Data model implications.**

```
card_owner {
  card_id: uuid
  user_id: uuid
  granted_by: user_id
  granted_at: timestamp
}
```

Owner list is queried on every attachment render and gate check.

**Acceptance criteria.**

- Collaborator without owner role cannot see "Owners Only" attachments in the rail, in chat references, or in search results.
- Haiku does not surface content from "Owners Only" attachments when responding to non-owner users.
- Owner can toggle visibility on existing attachments.
- Last-owner-removal returns explicit error.

---

### 4.9 Context Management

**Threshold.** When a card's active Haiku context (chat messages + parsed attachment content + metadata) crosses approximately **80,000 tokens**, the system triggers a combined commit and compact pass.

**Timing discretion.** Haiku 4.5's context awareness allows the model to track its remaining budget. The system uses this awareness to pick the right moment within the approach to 80K — typically between messages, not mid-generation. Claude Code should implement this using the model's context awareness primitives rather than naive per-message counting.

**Commit.** The full current chat history, including all messages, attribution metadata, review contributions, and synthesized prompts, is serialized as markdown and written to GitHub at:

```
tasks/notes/[project]/card-[card-id]-YYYY-MM-DD.md
```

where `[project]` is the card's project tag and `card-id` is the card's UUID. If multiple commits happen on the same day for the same card, append a numeric suffix (`-1`, `-2`, etc.).

**Compact.** After commit, the active context is reduced:

- The **most recent 20 messages** stay verbatim in active context.
- All prior messages are replaced with a Haiku-generated summary block labeled "Earlier in this conversation..." at the top of active context.
- All currently-attached files stay fully parsed in active context.
- Prior versions of attachments remain compacted (were never in active context under default parse rules).

**Persistence.** Full history remains accessible via the committed GitHub file. The card UI continues to display full history to the human user (commit and compact only affect Haiku's active context, not the chat pane's display).

**Acceptance criteria.**

- Token counting uses a reliable approximation method consistent with Anthropic's tokenizer (see Section 9 for open question on exact implementation).
- Commit write succeeds before compact executes. If commit fails, compact is aborted and retried on next threshold cross.
- Compact preserves last 20 messages verbatim and all current-version attachments.
- Summary block accurately represents the compacted portion.

---

### 4.10 Notifications

**Architecture.** Notifications are dispatched through a pluggable dispatch layer. v1 implements one channel (in-app). The dispatcher interface must accept future channels (Slack, email, push) without requiring refactor of notification generation logic.

**Notification types and treatments.**

| Type | Trigger | Visual treatment | Clearance |
|------|---------|------------------|-----------|
| Comment | New comment on card | Card badge + orange notification card in top banner summary | On card view OR manual dismiss |
| Approval | New approval on card | Green notification card in top banner summary | On card view OR manual dismiss |
| Mention | `@username` in a comment | Red notification card + persistent banner alert | Manual dismiss only |

**Aggregation.** The banner summary shows one notification card per changed card, not one per event. When multiple event types are unresolved on a card, **highest severity wins** for color (red > green > orange). The notification card includes a count breakdown on expand (e.g. "3 comments, 1 approval, 1 mention").

**Mention detection.** The comment composition field parses `@` patterns and resolves them against the card's collaborator and owner list. Only users with access to the card can be mentioned. Invalid mentions are rendered as plain text, not mentions.

**Data model implications.**

```
notification {
  id: uuid
  card_id: uuid
  type: enum(comment, approval, mention)
  triggering_event_id: uuid (foreign key to review_contribution)
  target_user_id: uuid
  created_at: timestamp
  viewed_at: timestamp (nullable)
  dismissed_at: timestamp (nullable)
}
```

**Dispatch interface (suggested).**

```
interface NotificationDispatcher {
  dispatch(notification: Notification, channels: Channel[]): Promise<void>
}

// v1 registers one channel
dispatcher.register(new InAppChannel())
// v2+ can add:
// dispatcher.register(new SlackChannel(...))
// dispatcher.register(new EmailChannel(...))
```

**Acceptance criteria.**

- Comment on card generates orange notification + badge for all collaborators except the commenter.
- Approval generates green notification for all collaborators except the approver.
- Mention generates red notification + persistent banner for the mentioned user only.
- Notification clears on card view (comment, approval) or explicit dismiss (mention).
- Adding a new channel in future version requires no change to notification generation code.

---

### 4.11 Search Across Card Chats

**Scope.** Global search bar at app level. Scope toggle: "This card" or "All cards."

**Searchable content (v1):**
- Chat messages
- Review contributions (comments and approvals)
- Synthesized prompts (see 4.15)
- Attachment filenames and URLs
- Card titles

**Explicitly not searchable in v1:** content inside parsed attachments (PDFs, DOCX bodies). Flagged as v2.

**Filters.** Author, date range, card, contribution type (comment/approval/mention), card project.

**Acceptance criteria.**

- Search returns results within 2 seconds on typical query.
- Results respect sensitivity tagging — "Owners Only" content does not surface for non-owners.
- Archived cards included by default; toggle to exclude.

---

### 4.12 Card Archival

**Triggers.**

- **Manual**: Archive action on card. Immediate.
- **Auto**: Default 90 days of inactivity. Inactivity = no new messages, review contributions, attachment uploads, or synthesized prompts. Threshold is configurable per user preference.

**Archived state.**
- Card becomes read-only.
- No new notifications generated.
- Remains fully searchable.
- Displays in a separate "Archived" filter view, hidden from default card list.
- Context management rules continue to apply — if an archived card's history somehow grows (e.g. via audit log), commit and compact still function.

**Restoration.** Any owner can restore an archived card to active via "Restore" action. Restoration resets the inactivity timer.

**Acceptance criteria.**

- Manual archive completes in one action with confirmation.
- Auto-archive triggers precisely at threshold without user intervention.
- Archived cards do not generate notifications or appear in default views.
- Search surfaces archived cards with visible "Archived" tag.
- Restore action is reversible without data loss.

---

### 4.13 Export

**Formats.**

| Format | Use case | Output location |
|--------|----------|-----------------|
| Markdown | GitHub commit, long-form reference | `tasks/notes/[project]/` (same path as auto-commit) |
| PDF | External sharing with non-system users | Browser download |
| Plain text (clipboard) | Quick paste to email or Slack | System clipboard |

**Export scope.** User selects before export:
- Full card (all content)
- Chat only
- Review notes only
- Synthesized prompts only
- Attachments metadata only (filenames, links, uploaders, no file bodies)

**Respects sensitivity.** Exports filter "Owners Only" content if the exporting user is not an owner.

**Acceptance criteria.**

- All three formats export successfully for all scope options.
- Markdown export matches the format of the auto-commit output.
- PDF export preserves formatting and attribution.
- Clipboard export is plain text (no markdown syntax visible).

---

### 4.14 Mobile Behavior

**Read-first priority.** The mobile experience prioritizes reading and lightweight interaction over content creation.

**Full-function on mobile:**
- Reading chat and comments
- Adding text comments
- Tapping approvals
- Reading notifications
- Synthesize Prompt button
- Search
- Archive and restore

**Reduced function on mobile:**
- **Iframe rendering**: falls back to native preview for attachments (mobile iframes of PDFs and documents are unreliable). Tap to open in native viewer.
- **File upload**: limited to camera roll and camera capture. No generic filesystem picker.
- **No drag-and-drop**.
- **New task creation**: single attachment at creation. Additional attachments added post-creation.
- **Compaction UI**: runs silently as specced; no mobile-specific controls.

**Not present on mobile in v1:**
- Multi-attachment upload interface
- Allowlist config editing
- Compare-versions action (deferred to desktop only)

**Acceptance criteria.**

- Every feature above functions correctly on latest iOS Safari and Android Chrome.
- Attachment tap opens native viewer without iframe attempt.
- Graceful error states where mobile cannot support a desktop feature (e.g. "Compare versions is available on desktop").

---

### 4.15 Synthesize Prompt

**Behavior.** Button on each card. When invoked, the system pulls all comments, review notes, Haiku mirror confirmations, and current attachment state from the card, and generates a structured prompt capturing what needs to change or be addressed. The generated prompt becomes a **first-class object on the card** (not just copied to clipboard).

**Trigger authority.** Any collaborator or owner can trigger synthesis. No role restriction. Attribution captures who triggered it and their role at time of generation.

**Regeneration behavior.** Re-invoking the Synthesize Prompt button creates a new version that threads against prior synthesized prompts (same model as attachment versioning). Current version is prominent in UI; prior versions accessible via version history affordance.

**Content of synthesized prompt.** The synthesis is structured for downstream use by Claude Code or another LLM:

```
## Card context
[card title and description]

## Current state
[summary of what the card is about right now]

## Requested changes
[synthesized from comments, grouped by theme]

## Open questions
[synthesized from unresolved Haiku mirror confirmations]

## Approval state
[N approvals from M collaborators, including list of approvers]

## Attachments referenced
[current-version attachments with brief description]
```

**Data model implications.**

```
synthesized_prompt {
  id: uuid
  card_id: uuid
  version_number: integer
  generated_by: user_id
  generated_by_role: enum(owner, collaborator)
  generated_at: timestamp
  body: text
  is_current: boolean
  source_review_contribution_ids: uuid[] (for audit)
}
```

**Acceptance criteria.**

- Synthesize button visible on every card.
- Generation completes within 10 seconds for cards with under 80K tokens of context.
- Generated prompt is saved to card, attributable, and versioned.
- Regeneration threads, does not overwrite.
- Export (Section 4.13) can scope to synthesized prompts only.

---

## 5. Data Model Summary

Key entities introduced or modified:

- `card` (existing, extended with multi-owner and archival state)
- `card_owner` (new join table)
- `attachment` (new, with card/comment scope and visibility)
- `attachment_version` (new, supports version threading)
- `review_contribution` (new, replaces prior "review" model)
- `notification` (new, pluggable dispatch)
- `synthesized_prompt` (new, first-class versioned object)

Entity relationships should be modeled with foreign key constraints where integrity matters (e.g. `review_contribution.attachment_version_id` must reference a valid version).

---

## 6. State Transitions

**Review contribution lifecycle:**
```
draft (unsubmitted) → submitted → [haiku mirror generated for comments] → [optionally: mirror_confirmed]
```

**Notification lifecycle:**
```
generated → dispatched (to in-app channel) → viewed OR dismissed → cleared
```

**Attachment version lifecycle:**
```
uploaded → parsed (if parsable) → current (is_current: true, all prior set to false)
```

**Card archival lifecycle:**
```
active → [manual archive OR inactivity threshold] → archived (read-only) → [restore action] → active
```

**Context management lifecycle:**
```
chat accumulates → token count approaches 80K → commit to GitHub → compact (summarize older, keep last 20 + current attachments) → chat resumes
```

**Synthesize prompt lifecycle:**
```
card state accumulates → user invokes synthesize → prompt generated, saved as v1 (is_current: true) →
  [regeneration] → prior version is_current: false, new version is_current: true
```

---

## 7. API Surface (Suggested)

Claude Code should implement or extend these endpoints. Exact shapes are recommendations; adjust to match existing conventions in the codebase.

```
# Review
POST   /cards/:card_id/contributions              # Create comment or approval
GET    /cards/:card_id/contributions              # List, with filters

# Attachments
POST   /cards/:card_id/attachments                # Create (upload or link)
POST   /cards/:card_id/attachments/:id/versions   # Upload new version
PATCH  /cards/:card_id/attachments/:id            # Update visibility
POST   /cards/:card_id/attachments/:id/promote    # Promote comment-level to card-level

# Ownership
POST   /cards/:card_id/owners                     # Add owner
DELETE /cards/:card_id/owners/:user_id            # Remove owner (blocks last-owner removal)

# Notifications
GET    /notifications                             # List for current user
PATCH  /notifications/:id                         # Mark viewed or dismissed

# Search
GET    /search                                    # Query params: q, scope, filters

# Archival
POST   /cards/:card_id/archive
POST   /cards/:card_id/restore

# Export
POST   /cards/:card_id/export                     # Body: {format, scope}

# Synthesize
POST   /cards/:card_id/synthesize                 # Generates new version of synthesized prompt

# Context management (internal)
POST   /cards/:card_id/context/commit             # Triggered by threshold, not user-facing
POST   /cards/:card_id/context/compact            # Triggered after commit
```

---

## 8. Acceptance Criteria (Cross-Cutting)

Beyond feature-specific criteria above, the following apply across the release:

- All new data model entities have migration scripts and rollback paths.
- Sensitivity tagging is enforced at every read path (API, render, search, export, Haiku context).
- No silent failures — all failed operations (parse, fetch, commit, dispatch) produce either a retry or a visible error state.
- Pluggable notification dispatcher is demonstrable by registering a stub second channel in a test harness.
- Mobile behavior degradations are explicit, not silent (user sees "Available on desktop" messaging).
- Full history of any card remains reconstructable from the committed GitHub files even after multiple compactions.

---

## 9. Open Implementation Questions

These are flagged deliberately for Claude Code to surface during scaffolding rather than decide silently. Each represents a real decision with implementation consequences:

1. **Token counting method.** Exact tokenizer for the 80K threshold — should this use Anthropic's published tokenizer, a client-side approximation (e.g. `tiktoken` equivalent), or a server-side call to the Anthropic token-counting endpoint? Trade-off: accuracy vs. latency per message.

2. **Allowlist config file location.** Where does the iframe-rendering allowlist live — `config/iframe_allowlist.json`, environment variable, database table? Database table allows runtime updates without redeploy; config file is simpler.

3. **Approval scope.** Does an Approval apply to the card as a whole, to a specific attachment version, or both? Current spec leaves this ambiguous. Recommendation: approvals can optionally scope to an attachment version if submitted from that version's thread; otherwise they're card-level. Claude Code should confirm before implementing.

4. **Haiku mirror failure handling.** If the Haiku mirror call fails (API error, timeout), does the comment still post without a mirror, post with a retry-indicator, or block until mirror succeeds? Recommendation: post without mirror and show a "Haiku did not confirm — click to retry" affordance. Confirm with owner before building.

5. **Synthesize prompt context budget.** If a card's context exceeds 80K tokens at synthesis time, does synthesis operate on the compacted view or does it pull the full committed history from GitHub for one-time synthesis? Recommendation: compacted view for speed, with a "Deep synthesis" action available to owners that fetches full history. Confirm before implementing.

6. **Mention notification for @all or @owners.** Should special mentions like `@owners` or `@all` be supported? Not in original spec. Recommendation: out of scope for v1 unless owner confirms otherwise.

7. **Attachment parse cache invalidation.** When an attachment version changes, the cached parse of the prior version should be retained for compare-versions action, but how long? Recommendation: retain for the life of the attachment unless storage constraints require eviction. Flag if storage budget is a concern.

8. **Owner role change after contribution.** A collaborator promoted to owner has existing contributions attributed with `author_role_at_submission: collaborator`. Historical attribution is preserved (correct behavior). Confirm this is the desired behavior and not accidentally wrong.

---

## 10. Out of Scope / Future Versions

Explicitly deferred:

- **v2 — Connector-backed parse for gated links.** Google Drive first, then Notion and private GitHub.
- **v2 — Full-text search inside parsed attachment contents.**
- **v2 — Push notification channels (Slack mirror, email, mobile push).** Dispatcher built to support these; channels not implemented.
- **v2 — Role-aware Haiku context.** Passing collaborator identity and role profile into Haiku's generation context so responses adjust to the asker.
- **v2 — Content-aware attachment version detection.**
- **v2 — Request Changes as a distinct review state.** If the soft approval model proves insufficient.
- **v3 — Card-level or cross-card workflow gates.** If approval-as-gate becomes needed beyond the current soft-signal model.
- **v3 — Mobile drag-and-drop, multi-attachment creation, compare-versions.**

---

## 11. Implementation Notes for Claude Code

- **Preserve existing code conventions.** This PRD does not dictate framework choices, file structure, or naming conventions beyond the data model suggestions. Match the existing codebase.
- **Migration safety.** Schema changes for `card_owner`, `attachment_version`, `review_contribution`, `notification`, and `synthesized_prompt` are additive where possible. Existing reviews under the old "create new review" model should be migrated into `review_contribution` records, not deleted.
- **Test coverage.** Prioritize tests for: sensitivity tagging enforcement (at every read path), version threading correctness, notification aggregation and clearance, compaction fidelity.
- **Observability.** Log commit+compact events with card ID, token count at trigger, and compaction duration. Failed parses, failed fetches, and failed notifications should log with enough context to diagnose.

*Italicized note: Where this PRD conflicts with reality on the ground in the existing codebase, Claude Code should pause and surface the conflict rather than silently adapting the spec. Scope creep through silent interpretation is a larger risk than asking one clarifying question.*

---

**End of PRD v1.0**
