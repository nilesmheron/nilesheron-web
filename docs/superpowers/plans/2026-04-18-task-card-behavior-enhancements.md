# Task Card Behavior Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the gated Reviews model with direct collaborative contribution, add attachment versioning, sensitivity tagging, context management, notifications, search, archival, export, and a Synthesize Prompt first-class object.

**Architecture:** Additive schema migrations on the live Supabase DB; new API routes following existing `app/api/tasks/[id]/[sub]/route.ts` conventions; new React components following the existing Client Component + fetch pattern; no framework changes, no build system changes.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Supabase (PostgreSQL + Storage + Auth), Anthropic SDK (Haiku 4.5), Tailwind CSS, GitHub API (via existing `lib/github`), ReactMarkdown (already installed).

**Repo for implementation:** `niles-task-dashboard` at `/Users/nmh/dev/niles-task-dashboard`

---

## Scope Check — Recommend Breaking Into Sub-Plans

This PRD covers 15 interdependent feature areas and 7 new DB tables. Shipping as one plan risks:
- Blocked sections waiting on open questions
- Long-running branches that drift from main
- Harder rollback if one section breaks production

**Recommended sub-plans (each ships independently):**

| Group | Sections | Why independent |
|-------|----------|-----------------|
| A: Data foundation | Schema migrations for all new tables | Everything else depends on this |
| B: Review model | 4.1, 4.2, 4.3 (partial) | Core collaborator UX |
| C: Attachments | 4.3 (full), 4.4, 4.5, 4.6, 4.7, 4.8 | Self-contained file subsystem |
| D: Context mgmt | 4.9 | Depends on GitHub token + token counting decision |
| E: Notifications | 4.10 | Pluggable architecture; can ship thin |
| F: Search | 4.11 | Can be built against existing + new tables |
| G: Archival + export | 4.12, 4.13 | Read-only ops, low risk |
| H: Mobile + Synthesize | 4.14, 4.15 | Polish + new prompt object |

**This plan proceeds as one document as requested, but flags where sub-plan breaks are natural.**

---

## Codebase State Before Implementation

Before reading any section below, these deviations from schema.sql matter:

| Schema.sql says | Actual live DB has |
|-----------------|-------------------|
| No `task_reviews` table | `task_reviews` table exists (queried in reviews routes) |
| No `task_notifications` table | `task_notifications` table exists (queried in notifications route) |
| `collaborators` has no `display_name` or `role` | Both columns exist (queried in auth.ts) |
| `task_comments` has no `review_id` | `review_id` column exists (filtered in comments route) |

**Any new migrations must target the live DB state, not schema.sql.** When writing migrations, verify column existence before adding. Do not re-run schema.sql — it will fail on already-existing types and tables.

---

## Decisions — All Resolved (2026-04-18)

| # | Question | Decision |
|---|----------|----------|
| OQ1 | Token counting method | **Rough estimate: `Math.ceil(text.length / 4)`.** Goal is backup-before-compact, not precision. |
| OQ2 | Allowlist config location | **Database table.** Most stable; editable at runtime without redeploy; accessible to future Claude sessions. |
| OQ3 | Approval scope | **Card-level only.** An approval signals "this is good to go" — it applies to the card as a whole, not a specific attachment version. |
| OQ4 | Haiku mirror failure | **Post comment without mirror; show "Haiku didn't confirm — retry" affordance.** |
| OQ5 | Synthesize context budget | **Compacted view by default; "Deep synthesis" action for owners pulls full committed history.** |
| OQ6 | @mentions | **User-specific only** (e.g. `@Caleb`). No `@all` or `@owners` in v1. |
| OQ7 | Parse cache retention | **Retain indefinitely** unless storage constraints require eviction. |
| OQ8 | Role change attribution | **Preserve.** Historical contributions keep `author_role_at_submission` as recorded. |
| OQA | Multi-owner model | **Anyone with a valid account can be a card owner.** Not limited to admin. The `card_owners` table is the authority; admin is always treated as an implicit card owner on all cards. |
| OQB | Existing reviews migration | **Migrate as `comment` type** in `review_contributions`. Associated `task_comments` rows with `review_id` set migrate as linked Haiku chat messages under the relevant contribution. |
| Export | Format scope | **Markdown file only for v1.** No PDF, no clipboard export. Simplifies 4.13 significantly. |

---

## 4.1 — Collaborator Review Model

**What changes:** The Reviews tab stops being "attach a document URL to get a review." Instead, any collaborator on a card can leave a comment or approval directly. The old gated flow (owner creates a review → collaborator sees split-pane) is removed. A new `review_contributions` table replaces `task_reviews` as the primary data model for structured collaboration.

The `haiku_mirror` mechanic is new: on every comment submission, the API fires a Haiku call and posts a mirror response ("To confirm I've captured this: ...") below the comment.

**Existing files to change:**
- `components/ReviewPanel.tsx` — major rewrite; current implementation assumes the "create new review" gate
- `app/api/tasks/[id]/reviews/route.ts` — replace with contribution endpoints (or rename to contributions)
- `app/api/tasks/[id]/reviews/[reviewId]/comments/route.ts` — fold into contribution model
- `lib/haiku.ts` — add `mirrorComment()` function
- `lib/database.types.ts` — regenerate after migration

**New files to create:**
- `supabase/migrations/001_review_contributions.sql` — creates `review_contributions` table, migrates existing `task_reviews` rows
- `app/api/tasks/[id]/contributions/route.ts` — POST (create comment/approval), GET (list with filters)
- `components/ContributionPanel.tsx` — replaces ReviewPanel; renders contribution list + compose area

**Conflicts with existing code:**
- `ReviewPanel.tsx` currently renders an iframe of `document_url` and a `ChatWindow`. The new model has no document_url as a required field. The iframe rendering moves to the attachment system (4.4/4.6). This is a full component replacement, not an extension.
- The old `task_reviews` table has `haiku_prompt` and `collaborator_prompt` columns (owner-set Haiku instructions per review). The new model has no per-review prompt — Haiku receives card context only. **Flag:** if you want per-card Haiku instructions for the review flow, say so now. The PRD doesn't include it.
- `app/api/tasks/[id]/reviews/[reviewId]/prompt/route.ts` — generates a task prompt from review comments. This moves to the Synthesize Prompt feature (4.15) and can be deleted after migration.

**Open questions that block this section:** OQ3, OQ4, OQA, OQB

---

## 4.2 — Attribution in Haiku Chat

**What changes:** Every chat message gets a visible author name and avatar treatment. Haiku messages get a "Haiku" label + distinct visual. No identity passed to Haiku in generation context (confirmed by PRD non-goal).

**Existing files to change:**
- `components/ChatWindow.tsx` — messages already have `author_name` and `author_role`. Current UI shows `You` / `AI` / `m.author_name`. Change to show full name always + distinct Haiku bubble. The data is already there; this is a UI-only change.
- `app/globals.css` or Tailwind config — may need a new Haiku-specific bubble style if distinct background shade is desired beyond the existing `bg-blue/5`

**New files to create:** None.

**Conflicts with existing code:** None significant. Current `ChatWindow` already renders differently for `owner`, `haiku`, and `collaborator` roles. Attribution is additive styling.

**Open questions that block this section:** None. Can implement immediately.

---

## 4.3 — Haiku Parsing of Attachments and Links

**What changes:** When an attachment is added (file upload or link), the server parses its content and stores a text representation. This parsed content gets injected into Haiku's context on every chat turn.

**Existing files to change:**
- `lib/haiku.ts` — `ownerChat()` and `collaboratorChat()` currently receive only `TaskContext` (name, priority, etc.). They need a new `attachmentContext?: string` parameter that injects parsed content into the system prompt.
- `app/api/tasks/[id]/comments/route.ts` — must fetch current-version parsed content for all card attachments and pass to Haiku calls.
- `app/api/tasks/[id]/attachments/route.ts` — POST handler must trigger parse after upload.

**New files to create:**
- `lib/parser.ts` — pluggable parse layer. Functions: `parseFile(buffer, mimeType): Promise<string>`, `parseLink(url): Promise<string>`. Internal implementations: `.pdf` via pdf-parse or similar, `.docx` via mammoth or similar, `.md` as-is, images as metadata-only. Public links via `fetch()` then HTML-to-text stripping. **Note:** these packages are not currently in package.json — will need `npm install`.
- `supabase/migrations/002_attachment_parsed_content.sql` — adds `parsed_content text` and `parse_status enum('pending', 'done', 'failed')` columns to `task_attachments`

**Conflicts with existing code:**
- `task_attachments` currently has no `parsed_content` column. Migration is additive.
- Parsing is synchronous in the request/response cycle per the PRD ("parsable within 10 seconds of upload"). This works for small files on Vercel's 300s timeout, but large PDFs could be slow. Flag if you want async parse with a loading state.
- The PRD says "build the parse layer with a pluggable fetch interface so adding Drive later does not require refactoring." The `lib/parser.ts` design above achieves this — internal implementations can be swapped without changing the caller interface.

**Open questions that block this section:** OQ7 (cache retention period affects storage design). Can proceed with "retain indefinitely" assumption and revisit.

---

## 4.4 — Tiered Iframe Rendering

**What changes:** Attachments render in three tiers: guaranteed render (uploads + self-hosted domains), graceful fallback with Open Graph preview card (external links), connector-backed (v2 only). Allowlist is config-driven. `.md` files render with formatting.

**Existing files to change:**
- `components/ReviewPanel.tsx` — currently has `isEmbeddable()` which checks `hostname.includes('nilesheron.com')`. This logic moves to a shared utility and is replaced by the tiered system.
- `components/TaskDetailClient.tsx` — the attachments tab currently just shows download links. This becomes an attachment rail with inline rendering.

**New files to create:**
- `lib/iframe-allowlist.ts` — exports `getAllowedOrigins(): string[]` and `getTier(url: string): 1 | 2 | 3`. Reads from config (location TBD — OQ2).
- `components/IframeRenderer.tsx` — renders one attachment: checks tier, renders iframe for tier 1, Open Graph card for tier 2, "connector required" message for tier 3.
- `components/MarkdownRenderer.tsx` — renders `.md` content with full formatting using ReactMarkdown (already installed). Used inside `IframeRenderer` for markdown attachments.
- `components/OpenGraphCard.tsx` — displays OG title, description, thumbnail, favicon, "Open in new tab" button. Server-fetches OG metadata via API.
- `app/api/og-preview/route.ts` — server-side OG fetch proxy (needed because client-side CORS blocks many OG fetches). Accepts `?url=` param, returns `{ title, description, image, favicon }`.

**Conflicts with existing code:**
- If OQ2 answer is "JSON file": add `config/iframe-allowlist.json` to `niles-task-dashboard`.
- If OQ2 answer is "env var": add `IFRAME_ALLOWED_ORIGINS` to Vercel env and `.env.example`.
- If OQ2 answer is "DB table": add migration + admin UI to edit (out of scope for v1 per PRD; just provide the table + seed data).
- The current `isEmbeddable()` in `ReviewPanel.tsx` will be deleted when ReviewPanel is rewritten.

**Open questions that block this section:** OQ2 (config location). Can stub with hardcoded list and migrate later, but PRD explicitly says "config-driven, not hardcoded."

---

## 4.5 — Approved File Formats

**What changes:** Upload rejects unsupported formats immediately with a clear error. All whitelisted formats render as specified in the table.

**Existing files to change:**
- `app/api/tasks/[id]/attachments/route.ts` — add format validation at the top of the POST handler before storage upload. Currently accepts any `file.type`.
- `components/TaskDetailClient.tsx` — the upload label currently accepts any file type (`<input type="file">`). Add `accept` attribute listing whitelisted MIME types.

**New files to create:**
- `lib/file-formats.ts` — exports `ALLOWED_MIME_TYPES: Record<string, string>` (mime → extension), `ALLOWED_EXTENSIONS: string[]`, `isAllowed(mimeType: string, filename: string): boolean`, `getRenderBehavior(mimeType: string): RenderBehavior`. Used by both the API validator and the component.

**Conflicts with existing code:**
- Existing `task_attachments` rows in the DB may have MIME types that don't pass the new whitelist (e.g. if any `.txt`, `.zip`, or other files were previously uploaded). The validator only applies to new uploads — existing rows are unaffected and will render with a "format not supported" fallback in the new attachment rail.
- `.csv` renders as "tabular render (basic)" per PRD table. This requires a lightweight CSV parser in the render layer — not a full spreadsheet. Use a small library or hand-roll a basic `<table>` renderer.

**Open questions that block this section:** None. Can implement immediately.

---

## 4.6 — Attachment Mechanisms

**What changes:** Three paths to attach: (1) formal Attach button on card body (card-level), (2) paste-to-attach in comment field (comment-level, with promote action), (3) multi-attachment at new-task-creation (card-level, desktop only).

**Existing files to change:**
- `components/TaskDetailClient.tsx` — current upload UI is a single file input in the attachments tab. This becomes a persistent Attach button on the card body, plus the multi-attach new task form changes.
- `components/ChatWindow.tsx` — add URL paste detection in the comment textarea (`onPaste` handler that checks for URL, triggers inline "Attach this link?" affordance).
- `components/OwnerDashboard.tsx` (new task form) — add 0..N file inputs for desktop; 0..1 for mobile.
- `app/api/tasks/[id]/attachments/route.ts` — add `scope` and `comment_id` to insert. Add link attachment path (currently only file upload exists).
- `app/api/tasks/route.ts` (create task) — handle initial attachments array in POST body.

**New files to create:**
- `supabase/migrations/003_attachment_schema_v2.sql` — adds `scope enum('card','comment')`, `comment_id uuid nullable`, `source enum('upload','link')`, `visibility enum('all_collaborators','owners_only')`, `file_metadata jsonb`, `og_metadata jsonb` to `task_attachments`. Backfills existing rows: `scope = 'card'`, `source = 'upload'`, `visibility = 'all_collaborators'`.
- `supabase/migrations/004_attachment_versions.sql` — creates `attachment_versions` table per PRD data model.
- `app/api/tasks/[id]/attachments/[attId]/promote/route.ts` — POST: set `scope = 'card'`, clear `comment_id`.
- `components/AttachmentRail.tsx` — card-level attachment strip showing all `scope=card` attachments with inline renderers.

**Conflicts with existing code:**
- Current `task_attachments` table has no `scope`, `source`, or `visibility` columns. Migration backfills all existing rows as `card`-scoped, `upload`-sourced, `all_collaborators`-visible — safe.
- `attachment_versions` is a new table; no existing data conflict.
- Current attachment DELETE handler doesn't clean up versions. Will need extension.

**Open questions that block this section:** None for the mechanism itself. OQ3 affects whether approvals can scope to an attachment version (used in promote flow design).

---

## 4.7 — Attachment Version Threading

**What changes:** Re-uploading a file with the same filename threads as a new version of the existing attachment. Explicit "Upload new version" action threads regardless of filename. Each version has its own review thread. Haiku sees current version only by default; "Compare versions" action on demand.

**Existing files to change:**
- `app/api/tasks/[id]/attachments/route.ts` — POST handler must: (1) check for filename match against existing card attachments, (2) if match found → create `attachment_version` record under existing `attachment_id`, set `is_current = true`, update prior versions to `is_current = false`, (3) if no match → create new `attachment` + first `attachment_version`.
- `lib/haiku.ts` — context building must filter `attachment_versions` to `is_current = true` only.

**New files to create:**
- `app/api/tasks/[id]/attachments/[attId]/versions/route.ts` — GET (list versions), POST (upload explicit new version).
- `components/AttachmentVersionHistory.tsx` — small popover showing version list with timestamp, uploader, and "view" action per version.

**Conflicts with existing code:**
- Current `task_attachments` rows have no version concept. Migration 004 (above) creates `attachment_versions` with a backfill: every existing attachment gets a `version_number: 1, is_current: true` version record pointing to its `storage_path`.
- The storage bucket path currently is `${task_id}/${timestamp}-${filename}`. Version 2+ of the same file should be stored as `${task_id}/${attachment_id}/v${N}-${filename}` to avoid collisions. New uploads follow the new path; existing uploads keep their current paths.

**Open questions that block this section:** None. Can implement after migrations 003 and 004.

---

## 4.8 — Sensitivity Tagging

**What changes:** Every attachment has `visibility: all_collaborators | owners_only`. Owners-only attachments are invisible to non-owners in the rail, in chat references, in search, and in Haiku context. Multi-owner model per card. Last-owner removal blocked.

**Existing files to change:**
- `app/api/tasks/[id]/attachments/route.ts` — GET must filter by visibility based on caller role.
- `app/api/tasks/[id]/comments/route.ts` — when building Haiku context, filter out `owners_only` attachments for non-owner sessions.
- `app/api/search/route.ts` (new, see 4.11) — must respect visibility.
- `components/AttachmentRail.tsx` (new) — render toggle for owner to flip visibility per attachment.

**New files to create:**
- `supabase/migrations/005_card_owners.sql` — creates `card_owners(card_id, user_id, granted_by, granted_at)`. Seeds one row per task with `user_id = (SELECT id FROM collaborators WHERE role = 'task_owner')` OR leaves empty if no `task_owner` exists, depending on OQA resolution. Also adds `PATCH /attachments/:id` endpoint for visibility toggle.
- `app/api/tasks/[id]/owners/route.ts` — POST (add owner), DELETE `/:userId` (remove owner, blocks last-owner removal).
- `app/api/tasks/[id]/attachments/[attId]/route.ts` — PATCH: update `visibility` field.

**Conflicts with existing code:**
- **Critical: OQA.** Current "owner" = Niles (admin via `OWNER_EMAIL`). The `card_owners` table implies a separate per-card owner list. If Niles is always an implicit owner, then `card_owners` only tracks delegated owners — but the RLS policies and auth checks need to know this. If Niles is NOT automatically in `card_owners`, then every existing task has no owner in the new model until the migration seeds it. **Must resolve OQA before writing this migration.**
- `requireOwner` / `requireAdmin` in auth.ts currently means "is the admin." The new `card_owners` model may need a `requireCardOwner(taskId)` helper that checks either `session.role === 'admin'` OR `card_owners` row exists for the session user. This changes auth logic across multiple routes.

**Open questions that block this section:** OQA (critical), OQ3, OQ8.

---

## 4.9 — Context Management

**What changes:** When a card's accumulated chat + attachment parsed content approaches 80K tokens, the system commits the full history to GitHub as a markdown file, then compacts Haiku's active context to the last 20 messages + a generated summary block. Full history still displays to the human; only Haiku's view is compacted.

**Existing files to change:**
- `lib/haiku.ts` — add token estimation before every Haiku call; trigger commit+compact when threshold crossed.
- `app/api/tasks/[id]/comments/route.ts` — after inserting human message + Haiku response, check token budget; dispatch commit+compact if needed.

**New files to create:**
- `lib/tokenizer.ts` — `estimateTokens(text: string): number`. Implementation pending OQ1.
- `lib/context-manager.ts` — `checkAndCompact(taskId, db, session): Promise<void>`. Orchestrates: count tokens → if near 80K → call `commitContext()` → if commit succeeds → call `compactContext()`.
- `lib/github-context.ts` — `commitCardHistory(taskId, project, messages, metadata): Promise<void>`. Writes to `tasks/notes/[project]/card-[id]-YYYY-MM-DD.md`. Uses the same GitHub client as `lib/github`. Handles same-day numeric suffix.
- `app/api/tasks/[id]/context/commit/route.ts` — POST (internal use; also callable manually for debugging).
- `app/api/tasks/[id]/context/compact/route.ts` — POST (internal use).
- `supabase/migrations/006_context_compaction.sql` — adds `context_compacted_at timestamptz`, `context_summary text`, `context_commit_path text` to `tasks` table. Stores the last compaction state.

**Conflicts with existing code:**
- The sync route at `/api/sync` uses `lib/github` (exists but not read). Context commits use a different write path (narrative markdown, not the task dashboard markdown format). Two separate GitHub write paths coexisting is fine — verify the GitHub token env var is available (`GITHUB_TOKEN` or similar — check `.env.example`).
- The 80K token threshold is a per-card count, not a per-conversation count. Need to decide: does token estimation include parsed attachment content (always included in Haiku context) or just chat messages? PRD says "chat messages + parsed attachment content + metadata" — all three.

**Open questions that block this section:** OQ1 (token counting method) — critical; determines `lib/tokenizer.ts` implementation. OQ5 affects 4.15 but not this section directly.

---

## 4.10 — Notifications

**What changes:** A pluggable notification dispatcher. v1 implements one channel: in-app. Notification types: comment (orange), approval (green), mention (red, persistent). Banner shows one notification card per changed card; severity aggregation with count breakdown.

**Existing files to change:**
- `app/api/notifications/route.ts` — existing route queries `task_notifications` but uses `read_at` only. Extend PATCH to handle `viewed_at` vs `dismissed_at` as separate fields. Add `dismissed_at` handling.
- `components/NavBar.tsx` — no notification bell currently exists. Add notification bell with unread count badge.
- `app/api/tasks/[id]/comments/route.ts` — after inserting a comment, dispatch notification to all card collaborators/owners except the commenter.

**New files to create:**
- `supabase/migrations/007_notifications_v2.sql` — adds `viewed_at timestamptz`, `dismissed_at timestamptz`, `type enum update` (current enum unknown — check live DB; PRD types are `comment`, `approval`, `mention`), `triggering_event_id uuid`, `target_user_id uuid` to `task_notifications`. Backfills `viewed_at = read_at` for all existing rows.
- `lib/notifications.ts` — dispatcher implementation. Exports `NotificationDispatcher` class with `dispatch(notification, channels)` method. Exports `InAppChannel` (writes to `task_notifications`). PRD interface suggestion copied verbatim.
- `components/NotificationBanner.tsx` — sticky banner below nav; one card per affected task; severity aggregation; "clear all" + per-notification dismiss.
- `components/MentionInput.tsx` — textarea wrapper that detects `@` patterns and shows a collaborator picker. Used in comment compose areas.

**Conflicts with existing code:**
- `task_notifications` exists with an unknown column set beyond what's in schema.sql. **Before writing migration 007, verify the live table's actual columns** with `SELECT column_name FROM information_schema.columns WHERE table_name = 'task_notifications'`. Do not add duplicate columns.
- `NavBar.tsx` currently has no notification state. Adding a real-time badge requires either polling or Supabase realtime subscription. PRD doesn't specify; polling every 30s is the low-risk default. Flag if you want Supabase realtime.
- Mention detection requires knowing the card's collaborator list inside the comment compose component. Currently `ChatWindow` doesn't receive the collaborator list. New prop needed.

**Open questions that block this section:** OQ6 (@all/@owners — recommend out of scope, confirm).

---

## 4.11 — Search Across Card Chats

**What changes:** A global search bar (app-level) with scope toggle ("This card" / "All cards"). Searches chat messages, review contributions, synthesized prompts, attachment filenames/URLs, and card titles. Filters: author, date range, card, contribution type, project. Respects sensitivity tagging.

**Existing files to change:**
- `components/OwnerDashboard.tsx` — current search is task-title-only, client-side, in `filterState`. The new search is server-side, full-content. These coexist: local filter for quick dashboard filtering, global search for deep lookup.
- `components/NavBar.tsx` — add global search input or trigger.

**New files to create:**
- `app/api/search/route.ts` — GET with query params: `q`, `scope`, `card_id`, `author_id`, `date_from`, `date_to`, `type`, `include_archived`. Returns paginated results across all searchable tables. Uses Postgres `ilike` or `to_tsvector` full-text search depending on performance requirements.
- `components/SearchResults.tsx` — renders result list grouped by card, with excerpt, author, timestamp, and "Open card" link.

**Conflicts with existing code:**
- Supabase free tier has full-text search built in (`to_tsvector`/`to_tsquery`). No separate search index needed for v1.
- Results must filter `owners_only` attachments for non-owners — requires joining `card_owners` (from 4.8) in search queries. **This section is blocked until 4.8 migrations are in place.**
- Archived cards included by default (toggle to exclude) — `tasks.status = 'archived'` is already in the tasks enum.

**Open questions that block this section:** None, but depends on 4.8 schema being in place.

---

## 4.12 — Card Archival

**What changes:** Manual archive (immediate, one action + confirmation) and auto-archive (90-day inactivity threshold, configurable per user). Archived cards are read-only, no notifications, searchable with "Archived" tag, separate filter view. Restore available to any owner.

**Existing files to change:**
- `components/TaskDetailClient.tsx` — `archiveTask()` already calls `PUT /api/tasks/:id` with `status: 'archived'`. This satisfies manual archive. Add confirmation dialog (currently no confirmation; PRD says "one action with confirmation"). Add "Restore" button for archived cards.
- `app/api/tasks/[id]/route.ts` — when `status = 'archived'`, also set `archived_at = now()`, reset `inactivity_timer`.
- `app/api/tasks/[id]/comments/route.ts` — block new comments/contributions if `tasks.status = 'archived'`.

**New files to create:**
- `supabase/migrations/008_archival.sql` — adds `archived_at timestamptz`, `auto_archive_threshold_days integer default 90`, `last_activity_at timestamptz` to `tasks`. The auto-archive cron trigger — see below.
- `app/api/tasks/[id]/archive/route.ts` — POST: set `status = 'archived'`, `archived_at = now()`.
- `app/api/tasks/[id]/restore/route.ts` — POST: set `status = 'active'`, clear `archived_at`, reset `last_activity_at`.

**Conflicts with existing code:**
- Auto-archive requires a cron job. The existing cron at `/api/sync` runs every 15 minutes. Auto-archive can run daily on a separate cron path. Vercel cron is already configured (`vercel.json` has crons section). Add a second entry: `{ "path": "/api/archive-cron", "schedule": "0 3 * * *" }`.
- `tasks.status` already has `'archived'` as a valid enum value — no enum migration needed.
- Inactivity tracking requires updating `last_activity_at` on every comment, attachment upload, contribution, and synthesized prompt creation. This is a cross-cutting concern — add a shared `touchTask(taskId, db)` helper called from all write routes.

**Open questions that block this section:** None. Can implement immediately (manual archive is already partially built).

---

## 4.13 — Export

**What changes:** Three formats (Markdown, PDF, clipboard plain text), five scopes (full card / chat only / review notes only / synthesized prompts only / attachment metadata only). Respects sensitivity tagging. Markdown export matches auto-commit format from 4.9.

**Existing files to change:**
- `components/TaskDetailClient.tsx` — add Export button (owner-only or all?) and scope/format selector UI.

**New files to create:**
- `app/api/tasks/[id]/export/route.ts` — POST with `{ format: 'markdown' | 'pdf' | 'clipboard', scope: ... }`. For markdown: returns text/markdown file. For PDF: use a library (Puppeteer headless is too heavy for serverless; recommend `@react-pdf/renderer` or `html2pdf.js` client-side). For clipboard: return plain text response.
- `lib/export.ts` — `buildMarkdown(task, scope, isOwner): string`. Shared between export and context-commit to guarantee format parity.
- `components/ExportPanel.tsx` — scope/format selector modal with confirm button.

**Conflicts with existing code:**
- PDF generation on a serverless function is risky (Puppeteer + Vercel = cold start + binary size issues). The PRD says "browser download" for PDF — this could be done client-side with `window.print()` or a client-side PDF library to avoid the server-side PDF problem. Flag this as a design decision: server-side vs client-side PDF.
- Clipboard export: `navigator.clipboard.writeText()` is client-side only. The API route returns the text; the component triggers clipboard write.

**Open questions that block this section:** None, but PDF method is a design decision (server vs client) worth confirming.

---

## 4.14 — Mobile Behavior

**What changes:** Mobile-specific degradations: iframe → native preview tap, file upload → camera roll only, no drag-and-drop, single attachment at task creation, "Available on desktop" messages for unavailable features.

**Existing files to change:**
- Every component that renders iframes — add mobile detection (`useIsMobile` hook) and substitute native preview link.
- `components/AttachmentRail.tsx` (new) — mobile branch renders `<a href={url} target="_blank">` instead of iframe.
- `components/OwnerDashboard.tsx` new-task form — limit to single attachment on mobile.
- `components/AttachmentVersionHistory.tsx` (new) — hide "Compare versions" on mobile, show "Available on desktop" message.
- `components/ChatWindow.tsx` — file upload input on mobile: add `accept="image/*"` and `capture="environment"` for camera-first UX.

**New files to create:**
- `lib/use-is-mobile.ts` — custom hook that returns `boolean` based on `window.innerWidth < 768`. Matches existing `isMobile` pattern already used in `ReviewPanel.tsx`.

**Conflicts with existing code:**
- `ReviewPanel.tsx` already has an `isMobile` state and mobile tab layout. This pattern is the template; the new components should follow it.
- No drag-and-drop currently exists, so "no drag-and-drop on mobile" is a non-change.

**Open questions that block this section:** None. Can implement alongside each component as it's built.

---

## 4.15 — Synthesize Prompt

**What changes:** A "Synthesize" button on every card triggers Haiku to pull all review contributions, mirror confirmations, and attachment state into a structured prompt following the PRD's template. The generated prompt is a first-class versioned card object — not just copied to clipboard. Regeneration threads.

**Existing files to change:**
- `components/ChatWindow.tsx` — current "Synthesize feedback into Claude prompt" button generates an ephemeral prompt (shown in-component, not saved). This existing feature is superseded. The button moves to the card level and the output is saved.
- `app/api/tasks/[id]/prompt/route.ts` — current implementation generates a prompt from comments using `generateTaskPrompt()` in haiku.ts. Replace with the new structured synthesis.
- `lib/haiku.ts` — add `synthesizePrompt(task, contributions, attachments): Promise<string>` that follows the PRD template structure.
- `lib/database.types.ts` — regenerate after migration.

**New files to create:**
- `supabase/migrations/009_synthesized_prompts.sql` — creates `synthesized_prompts` table per PRD data model. Migrates existing `task_prompts` rows: each becomes a `synthesized_prompt` with `version_number: 1, is_current: true, generated_by: admin_user_id`.
- `app/api/tasks/[id]/synthesize/route.ts` — POST: generates new version, saves to `synthesized_prompts`, sets prior version `is_current = false`.
- `components/SynthesizePrompt.tsx` — button + version history viewer + copy action. Replaces the current generate-prompt affordance in `ChatWindow`.

**Conflicts with existing code:**
- `task_prompts` table exists with simple `prompt_text`, `status` columns — no versioning, no attribution. Migration 009 migrates these rows into `synthesized_prompts` and retains `task_prompts` as a legacy table (do not drop in v1 in case of rollback need).
- The current `generateTaskPrompt()` in haiku.ts has a different output format (a raw "Claude-ready prompt") vs the PRD's structured template with sections. Both can coexist in `lib/haiku.ts` during transition; delete the old function after migration is confirmed.
- `ChatWindow` currently shows the generated prompt inline with a copy button. This UI element should be removed when `SynthesizePrompt.tsx` ships, or it will be confusing to have both.

**Open questions that block this section:** OQ5 (context budget: compacted view vs. full history pull). OQ5 affects whether synthesis works on all cards or only cards under 80K tokens without a special action.

---

## File Map Summary

### In `niles-task-dashboard`:

**Modify:**
- `supabase/schema.sql` — update to match live DB after migrations (documentation only; never re-run)
- `lib/haiku.ts` — add `mirrorComment()`, `synthesizePrompt()`, token-aware context building
- `lib/database.types.ts` — regenerate after all migrations land
- `lib/supabase.ts` — add type aliases for new tables
- `components/TaskDetailClient.tsx` — Attach button, export button, archival confirmation, notification badge, synthesize button placement
- `components/ChatWindow.tsx` — attribution styling, mention detection, remove old generate-prompt UI
- `components/ReviewPanel.tsx` — full rewrite to `ContributionPanel`
- `components/NavBar.tsx` — notification bell + global search trigger
- `components/OwnerDashboard.tsx` — multi-attach form, search integration
- `app/api/tasks/[id]/reviews/route.ts` — deprecate (keep for backward compat during migration, then remove)
- `app/api/tasks/[id]/attachments/route.ts` — format validation, version threading, link attachment, visibility filtering
- `app/api/tasks/[id]/comments/route.ts` — notification dispatch, context management trigger, mention detection
- `app/api/tasks/[id]/route.ts` — `last_activity_at` update, archival fields
- `app/api/notifications/route.ts` — viewed/dismissed separation
- `vercel.json` — add archive-cron entry

**Create (lib):**
- `lib/parser.ts`
- `lib/iframe-allowlist.ts`
- `lib/file-formats.ts`
- `lib/tokenizer.ts`
- `lib/context-manager.ts`
- `lib/github-context.ts`
- `lib/notifications.ts`
- `lib/export.ts`
- `lib/use-is-mobile.ts`

**Create (components):**
- `components/ContributionPanel.tsx`
- `components/AttachmentRail.tsx`
- `components/AttachmentVersionHistory.tsx`
- `components/IframeRenderer.tsx`
- `components/MarkdownRenderer.tsx`
- `components/OpenGraphCard.tsx`
- `components/NotificationBanner.tsx`
- `components/MentionInput.tsx`
- `components/SearchResults.tsx`
- `components/ExportPanel.tsx`
- `components/SynthesizePrompt.tsx`

**Create (API routes):**
- `app/api/tasks/[id]/contributions/route.ts`
- `app/api/tasks/[id]/attachments/[attId]/route.ts` (PATCH visibility)
- `app/api/tasks/[id]/attachments/[attId]/versions/route.ts`
- `app/api/tasks/[id]/attachments/[attId]/promote/route.ts`
- `app/api/tasks/[id]/owners/route.ts`
- `app/api/tasks/[id]/archive/route.ts`
- `app/api/tasks/[id]/restore/route.ts`
- `app/api/tasks/[id]/export/route.ts`
- `app/api/tasks/[id]/synthesize/route.ts`
- `app/api/tasks/[id]/context/commit/route.ts`
- `app/api/tasks/[id]/context/compact/route.ts`
- `app/api/search/route.ts`
- `app/api/og-preview/route.ts`
- `app/api/archive-cron/route.ts`

**Create (migrations):**
- `supabase/migrations/001_review_contributions.sql`
- `supabase/migrations/002_attachment_parsed_content.sql`
- `supabase/migrations/003_attachment_schema_v2.sql`
- `supabase/migrations/004_attachment_versions.sql`
- `supabase/migrations/005_card_owners.sql`
- `supabase/migrations/006_context_compaction.sql`
- `supabase/migrations/007_notifications_v2.sql`
- `supabase/migrations/008_archival.sql`
- `supabase/migrations/009_synthesized_prompts.sql`

**Create (config, pending OQ2):**
- `config/iframe-allowlist.json` (if OQ2 = JSON file)

### In `nilesheron-web`:

- `docs/superpowers/plans/2026-04-18-task-card-behavior-enhancements.md` — this file

---

## Implementation Order (Dependency-Safe)

1. **Resolve all blocked open questions** (OQ1, OQ2, OQ3, OQ4, OQ5, OQ6, OQ8, OQA, OQB) before writing any code.
2. **Migrations first** (001 → 009 in order). Each migration is additive. Run in Supabase dashboard; update schema.sql after each.
3. **Lib layer** (parser, file-formats, iframe-allowlist, tokenizer, notifications dispatcher) — no UI dependencies; testable in isolation.
4. **API routes** — depend on migrations + lib.
5. **Components** — depend on API routes.
6. **Integration** — wire components into TaskDetailClient, NavBar, OwnerDashboard.

---

## Cross-Cutting Acceptance Criteria Checklist

Per PRD §8 — verify before shipping each sub-plan:

- [ ] Every new DB entity has a migration with a documented rollback (DROP TABLE / ALTER TABLE DROP COLUMN)
- [ ] Sensitivity tagging enforced at API layer, not just UI (test: call API as collaborator for an owners-only attachment, expect 404/403)
- [ ] No silent failures — every catch block either retries or returns a visible error
- [ ] Pluggable dispatcher testable with a stub channel (write a unit test that registers `StubChannel` and verifies `dispatch()` was called)
- [ ] Mobile degradations show explicit "Available on desktop" messaging (not silent omission)
- [ ] Full chat history reconstructable from GitHub committed files after multiple compactions

---

*Awaiting your answers to the open questions before implementation begins.*
