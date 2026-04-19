# CLAUDE.md — nilesheron-web

Engagement posture for Claude Code when working in this repo. See `DEVELOPMENT.md` at root for technical/architectural context (read it first on any new session).

---

## Repo identity

Personal domain real estate under `nilesheron.com`. Static HTML, no build step. Single repo serving four jobs: personal brand/archive, client work (`grav/`), internal TechTown program assets (`tbp/`), and public tools (`sandbox/`, `projects/`, `templates/`). Also hosts a shared backend at `api/` used by `tasks.nilesheron.com` and `sandbox/personal-ai-os/`.

Live at `dev.nilesheron.com`. Auto-deploys from `main` via Vercel in ~30 seconds.

Public repo. Low blast radius.

---

## Autonomy level

**Direct-to-main, low ceremony.** No PRs, no feature branches, no review dance. Commit, watch Vercel deploy, verify live at the relevant URL.

**Exception — coordinate before changing:**

- `api/chat.js` request/response shape — shared backend; breaking changes affect both `sandbox/personal-ai-os/` (this repo) and `tasks.nilesheron.com` (separate repo). If the shape has to change, version the endpoint or coordinate a dual-site update.
- `vercel.json` CSP `frame-ancestors` header — load-bearing for iframe embedding from `tasks.nilesheron.com`. Changing it can silently break the parent app.
- `middleware.js` matcher — scoped to `/grav` today; expanding scope needs intention, not reflex.

If any of those come up and the path forward isn't obvious, stop and flag before committing.

---

## Commit conventions

Lowercase conventional prefixes. Short, specific. Examples from history:

- `Add static sample report page — Darius / nonprofit program director persona`
- `chore(reset-account): update prompt text to match 5-char minimum`
- `fix: add origin allow-list to chat proxy`

`feat:` for new pages or features, `fix:` for bug fixes, `docs:` for markdown, `chore:` for minor cleanup. Keep messages in the imperative mood and under ~70 characters where possible.

---

## Testing bar before calling a change done

This repo has no test suite, no typecheck, no build step. Verification is manual and live:

1. Commit and push to `main`.
2. Wait ~30 seconds for Vercel to deploy.
3. Open the affected URL at `dev.nilesheron.com/...` and confirm the change renders as expected.
4. For `api/` changes, test the endpoint with `curl` or from a consumer page — don't just assume the deploy worked.
5. For `middleware.js` or `vercel.json` changes, test both the gated path and an unrelated path to confirm you didn't break the matcher scope.

Always give the user a one-line smoke test instruction before the change lands. Example: `curl -X POST https://dev.nilesheron.com/api/chat -H "Origin: https://tasks.nilesheron.com" -d '{"messages":[{"role":"user","content":"hi"}],"model":"claude-haiku-4-5-20251001"}'`.

---

## When to stop and ask

- Change would modify `api/chat.js` request/response shape
- Change would modify `vercel.json` headers (CSP especially)
- Change affects a page that's embedded as an iframe elsewhere (`tbp/*`)
- Change introduces a new runtime dependency (new CDN, new npm package) — this repo is deliberately dependency-light
- Request could be read multiple ways and the wrong read is non-trivial to reverse

Default to scope discipline: don't refactor adjacent code that isn't named in the task. If something looks wrong nearby, flag it and move on.

---

## Session note protocol

At the end of a substantive session, write a session note to:

```
~/dev/niles-ai-management/tasks/notes/nilesheron-web/session-YYYY-MM-DD.md
```

Commit and push it separately from the code changes in this repo. That's a cross-repo commit from a single session — accepted tradeoff for continuity.

**What to include:** live URLs, key files touched, features built or bugs fixed, known issues left open, open/next items with enough context for a fresh session to pick up.

**Format:** prose preferred; bullets fine for file lists. Match the tone of existing session notes in that directory.

If the change set was trivial (single-line copy edit, typo fix), skip the session note. Substantive = took meaningful reasoning or took more than one commit to land.

---

## Context pointers

- **Structural/architectural context:** `DEVELOPMENT.md` at root. Read at session start. It covers the four-jobs-in-one-repo pattern, the shared `api/` backend, the SuperDesign export trap, and known tech debt.
- **Universal profile:** `~/dev/niles-ai-management/profile/profile-condensed.md` (short) or `profile-full.md` (long). Read the condensed for orientation; pull the full version for significant co-working sessions.
- **Related repos:**
  - `~/dev/niles-task-dashboard` — consumes this repo's `api/chat.js` cross-origin and iframe-embeds `tbp/*` pages. Keep the sync contract intact.
  - `~/dev/niles-ai-management` — where session notes land.

---

## Out of scope in this repo

- Don't add a build step, bundler, or framework without explicit direction. The no-build-step constraint is deliberate.
- Don't introduce browser storage (`localStorage`, `sessionStorage`) in any page that might end up embedded as an iframe — same rule as `niles-task-dashboard`. Use in-memory state only.
- Don't commit env values. Env vars live in Vercel; local dev needs `vercel env pull .env.local` or equivalent.
- Don't touch `grav/` content without confirming with the user — that's client work under a separate engagement.
- Don't touch `tbp/` assets without confirming they aren't currently in use as iframe embeds on `tasks.nilesheron.com`.

---

## Known gotchas (short list; full list in DEVELOPMENT.md)

- `api/chat.js` is a shared proxy. Changes propagate silently to both consumer products.
- CSP `frame-ancestors` in `vercel.json` must stay in sync with the parent-frame allow-list expected by `tasks.nilesheron.com`.
- SuperDesign exports bring runtime dependencies that break outside SD's preview. Strip them before shipping (see DEVELOPMENT.md §3).
- Clean URL rewrites in `vercel.json` are explicit per path — new templates need both the file and the rewrite entry.
