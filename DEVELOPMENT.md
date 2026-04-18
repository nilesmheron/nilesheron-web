# DEVELOPMENT.md

Context for future Claude Code sessions on `nilesmheron/nilesheron-web`. Prioritizes decisions and patterns over implementation details. Last synthesized 2026-04-18.

---

## 1. Purpose & Scope

Personal domain real estate under `nilesheron.com`. Single repo, multiple independent sections, one Vercel deployment.

- **`dev.nilesheron.com`** (live) — this repo, auto-deployed from `main`.
- **`nilesheron.com`** (still Tumblr) — pending content migration and DNS cutover.

The repo is doing four jobs at once, and that's intentional:

1. **Personal brand / archive** (`archive/`, eventually `/`) — a 20-year poetry archive migrating off Tumblr, plus future bio and homepage.
2. **Client work** (`grav/`) — password-gated Gravillis preview.
3. **Internal TechTown assets** (`tbp/`) — program materials in development, shared into the task dashboard via iframe.
4. **Public tools and experiments** (`sandbox/`, `projects/`, `templates/`) — including a public Haiku-powered AI workflow assessment tool.

Infra cost is roughly $12/year (domain only). Everything else runs on free tiers.

---

## 2. Architectural Decisions

### Static HTML, no build step
Every page is a self-contained HTML file. Tailwind via CDN, Iconify for icons, Google Fonts (Lora serif, Caveat handwriting). No bundler, no framework, no package manager for front-end code. This was deliberate — Vercel auto-deploys on push in ~30 seconds, and there's nothing to break between commit and live.

**Tradeoff accepted:** No shared component layer. Nav, footer, and design tokens are inlined per page. When they need to change, they change in every file. A build step would solve this but would also introduce failure modes that don't currently exist. Revisit if file count grows past ~20 or if design iterations become painful.

### Serverless functions only where state or secrets are required
`api/` holds three Vercel serverless functions, each narrow and single-purpose:
- `chat.js` — proxy to `api.anthropic.com/v1/messages` using `ANTHROPIC_API_KEY`. Exists so `ANTHROPIC_API_KEY` never ships to the browser.
- `feedback.js` — POST feedback rows to Supabase `feedback` table.
- `report.js` — POST and GET for shareable assessments in Supabase `reports` table.

All three consume Vercel env vars (`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`). They're used exclusively by `sandbox/personal-ai-os/` today; everything else in the repo is static.

### Password gate as middleware, not per-page
`grav/` (Gravillis client preview) is gated by `middleware.js` using HTTP Basic Auth with password stored in `GRAV_PASSWORD` env var. Any username works; the password is the gate. Matcher is scoped to `/grav` and `/grav/:path*` so nothing else on the site is affected.

**Why this over per-page JS:** basic auth is enforced at the edge before any HTML is served. The preview can't be exfiltrated by viewing source or bypassing client code.

### Clean URLs via `vercel.json` rewrites, not directory indexes
`vercel.json` has `cleanUrls: true` and explicit rewrites for each template (`/templates/onboarding` → `/templates/onboarding.html`, etc.). This keeps URLs public-readable and also keeps the file structure flat — no `onboarding/index.html` nesting.

### CSP allows iframe embedding from known surfaces
`vercel.json` sets `Content-Security-Policy: frame-ancestors 'self' https://niles-task-dashboard.vercel.app https://tasks.nilesheron.com`. `tbp/` assets are embedded as iframes into the task dashboard at `tasks.nilesheron.com`, and the CSP is the formal allow-list for that.

---

## 3. Implementation Patterns

### Design system (for brand/archive pages)
Retained from the original SuperDesign export:
- Colors: `--color-primary: #b5793e` (amber), `--color-bg: #e8e8e8`, `--color-text: #444444`, `--color-muted: #999999`, `--color-border: #d4d4d4`
- Fonts: Lora (serif headings/body), Caveat (handwritten accents), Menlo (mono)
- Animation: `.fade-in` with `.delay-1` through `.delay-6`
- Tailwind configured inline via the CDN config script

This system is **only applied to `archive/` and future brand pages**. Tool pages (`sandbox/`, `tbp/`, `templates/`) have their own visual languages appropriate to their function. Do not globally re-skin.

### SuperDesign export handling
Pages exported from SuperDesign.dev arrive with runtime dependencies that break outside the SD preview environment. Before any SD export ships, strip:
- `body:not(.sd-ready)` opacity hide (hides the page until SD registers it)
- Screenshot/iframe messaging bridges
- Component registry API calls to `api.superdesign.dev`
- petite-vue import
- Visual edit bridge

And inline any `sd-component` fetches (nav, footer) directly into the HTML. `web_fetch` returns rendered DOM rather than raw source for SD-hosted pages, so if the raw source isn't already at `/mnt/user-data/uploads/`, ask for the file upload before trying to work from the URL.

### GitHub writes
Two tools available; both work:
- `create_or_update_file` — cleaner for single-file writes with raw HTML content. When updating an existing file, SHA is required.
- `push_files` — multi-file commits in one call. Requires backslash-escaping single quotes within HTML attribute values in the JSON payload.

File size limit is ~1MB per file via API. For long documents, split by section rather than condense — this is enforced by the profile too.

### Pre-commit verification
For multi-file pushes of large HTML, a Python3 bash one-liner that counts characters and checks for `<!DOCTYPE` across all files at once catches truncation and malformed exports before they're pushed.

---

## 4. Dependencies & Integrations

### External runtime dependencies (loaded in-browser)
- Tailwind CDN (`cdn.tailwindcss.com`)
- Iconify (`code.iconify.design/iconify-icon/1.0.7/...`)
- Google Fonts (Lora, Caveat)
- Anthropic Messages API (via `api/chat.js` proxy) — `claude-haiku` for sandbox assessments
- Supabase REST API (via `api/feedback.js`, `api/report.js`) — tables `feedback` and `reports`

### External runtime dependencies (legacy, needs migration)
- SuperDesign Supabase bucket hosts the logo image used across `archive/` pages. Flagged as non-permanent and needs to move to the repo or another stable host.

### Infra
- **Vercel** (Hobby tier) — hosting, serverless functions, edge middleware. Auto-deploys from `main`.
- **GitHub** — source of truth. Repo is public (`nilesmheron/nilesheron-web`).
- **eNom via Google Workspace** — DNS. CNAME for `dev` points at Vercel.

### Required Vercel env vars
- `ANTHROPIC_API_KEY` — for `api/chat.js`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — for `api/feedback.js` and `api/report.js`
- `GRAV_PASSWORD` — for `middleware.js` Basic Auth gate

### Consumers of this repo (things that depend on us)
- `tasks.nilesheron.com` / `niles-task-dashboard.vercel.app` — iframe-embeds `tbp/*` pages. Any breaking change to paths in `tbp/` breaks those embeds.
- Gravillis (client) — views `grav/` behind the Basic Auth gate.

---

## 5. Technical Debt & Limitations

- **Logo asset still on SuperDesign's Supabase bucket.** Should be moved into the repo before SD decides to clean up unused uploads.
- **No shared component layer.** Nav, footer, and design tokens are duplicated across every `archive/` page. Fine at current size; painful later.
- **Placeholder root (`index.html`).** The live root of `dev.nilesheron.com` is a "Something is being built here" stub. Homepage architecture is a TBD decision (archive-as-homepage vs. dedicated homepage vs. long-scroll).
- **Bio page (`/archive/bio`) not yet built.** Requires Instagram handle and bio copy; Behold.so is the planned integration for the live IG grid but a static curated grid ships first.
- **Mixed identity in `archive/`.** Pages still reference the mmh placeholder brand in places. Rebrand to Niles is the next planned work on that section.
- **No automated testing.** Verification is manual (live check at `dev.nilesheron.com`) plus the pre-commit Python character-count check. Acceptable at current scale.
- **`sandbox/personal-ai-os/` API wiring not documented in this file beyond inference.** `index.html` appears to be the assessment flow, `report.html` renders a saved report (uses `api/report.js` GET), and `sample.html` is likely a static demo. Confirm by reading these files if making changes.

---

## 6. Current State

### Built and live
- `archive/` — five pages (index, about, contact, poetry, piece) deployed. SuperDesign runtime stripped. Internal nav wired.
- `projects/gantt.html` — CTE gantt chart migrated from `nilesmheron/cte`.
- `grav/` — Gravillis client preview, gated by Basic Auth middleware.
- `tbp/` — four program artifacts (curriculum-calendar, lean-canvas-deck, program-brief, program-calendar) embedded into the task dashboard.
- `templates/` — five templates (onboarding, task-management, profile-versioning, cross-platform-packager, plus a gallery index).
- `sandbox/personal-ai-os/` — public Haiku-powered AI workflow assessment. Uses all three `api/` endpoints.
- `api/` — three serverless functions deployed.
- `middleware.js` — edge auth gate on `/grav/*`.

### In progress / planned
1. Rebrand `archive/` pages off mmh placeholder to real Niles identity.
2. Build `/archive/bio` — three bio length variants with copy buttons, "currently" section, social links, static Instagram grid (Behold wiring when ready).
3. Decide homepage architecture and build `/`.
4. Migrate logo off SuperDesign Supabase bucket.
5. Eventual `nilesheron.com` DNS cutover off Tumblr.

### Blocked on user input
- Niles's Instagram handle (for bio page)
- Actual bio copy in three length variants
- Homepage architecture decision

---

## 7. Development Workflow

### Transition context
Everything in this repo to date was built through Claude web chat using the GitHub MCP — no local checkout, no Claude Code. This `DEVELOPMENT.md` is being created as part of moving management and further development to **Claude Code** locally. Future sessions should assume a local clone and normal git workflow going forward.

### Legacy workflow (what got us here)
- All edits made in Claude chat
- GitHub MCP tools (`push_files`, `create_or_update_file`) wrote directly to `main`
- Vercel auto-deployed on push
- No branches, no PRs — commits went straight to `main`

### Gotchas for Claude Code
- **Two GitHub MCP tools exist** (`github:*` lowercase and `Connect to GitHub via OAuth:*`). In at least one past session the lowercase one was unresponsive; fall back to the OAuth version.
- **Env vars live in Vercel only.** Anything under `api/` or `middleware.js` will fail locally without `vercel dev` pulling env vars down, or without a local `.env.local` that mirrors production. Never commit env values.
- **CSP `frame-ancestors` allow-list is load-bearing.** If `tasks.nilesheron.com` or `niles-task-dashboard.vercel.app` stops embedding a `tbp/` page, check `vercel.json` headers before debugging the iframe parent.
- **`middleware.js` matcher is scoped to `/grav`.** Adding other gated sections means extending the matcher, not adding a second middleware file (Vercel expects one).
- **Clean URL rewrites are explicit per path** in `vercel.json`. Adding a new template under `/templates/` requires both the file and a new rewrite entry.
- **SuperDesign exports need dependency stripping** (see §3) before they ship. This is still live — templates coming out of SD will have the same runtime trap.

### File conventions
- No version numbers in filenames. Version tracked inside the file if needed.
- Reference/background material lives under `reference/[project]/` if added (pattern established in the adjacent `niles-ai-management` repo; not yet used here).
- Split long files by section rather than condense to fit GitHub's ~1MB API limit.
