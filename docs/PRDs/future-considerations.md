# Future Considerations: Task Dashboard

**Project:** niles-task-dashboard (tasks.nilesheron.com)
**Last Updated:** 2026-04-18 UTC

Running log of investigation items and future-build candidates for the task dashboard that are out of scope for the current PRD. Not committed roadmap — items here are flagged for evaluation ahead of v2+ planning.

*New entries at top, newest first. Each entry should include: status, summary, investigation scope, and any implementation flags from v1 that are relevant.*

---

## Board-level integration access for Haiku instance in cards

**Added:** 2026-04-18
**Status:** Investigation needed. Not in v1 PRD scope.

**Summary.** The current PRD (v1.0) gives Haiku access to uploaded files, public links, and self-hosted pages for parsing within card chats. This covers document-driven review well. It does not cover the case where a collaborator references the state of a connected system in real time — "the latest deploy," "what's in the repo right now," "what the database shows." For cards that anchor to active work in other systems, Haiku is effectively blind to that state.

**Investigation scope.** Determine whether board-level or card-level integration access should be built for:

- **GitHub** — repository state, open PRs, recent commits, branch status, issue state on linked repos
- **Supabase** — database schema, recent migrations, row counts, query logs, service health
- **Vercel** — deployment status, build logs, preview URLs, runtime errors, environment state

Other integrations (Slack channel state, Granola meeting content, Google Drive active documents, Linear or Jira issue state, etc.) should be considered in the same investigation.

**Key questions to resolve:**

1. Which integrations provide the highest value per build cost. Likely GitHub first given how much of the work is repo-anchored, but worth validating against actual card usage patterns once v1 ships.
2. Auth model — service-account access per-card, per-workspace, or per-user OAuth. Trade-off between simplicity and attribution/security.
3. Read-only vs. read-write boundary. Strong default: read-only for first release; write actions escalate to explicit user confirmation even if auth permits them.
4. Whether integration content counts against the 80K token context threshold as it's fetched, or is pulled on-demand per query and not persisted.
5. Sensitivity implications. Integrated systems often contain more sensitive content than uploaded files (database rows, internal repos, unreleased builds). Visibility rules may need to extend beyond the v1 attachment-level model.

**Relevant v1 foundations.** The pluggable fetch interface specced in Section 4.3 of the v1 PRD, and the token-counting approach resolved under Section 9 question #1, are likely architectural foundations for this work. Claude Code should be aware of this future direction when building v1 so integration access can be added without refactor.

---

*End of log.*
