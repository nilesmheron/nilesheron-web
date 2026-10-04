# Motif error alerts: spec

**Version:** 1.0
**Last Updated:** 2026-10-03
**Repo:** nilesheron-web · **Files:** `motif/listen.js`, `motif/listen.html`, `api/motif-report.js`, `api/motif-*.js` (server errors), `supabase/`, `CLAUDE.md`

Read CLAUDE.md and DEVELOPMENT.md first. Direct-to-main. If the interrupt/resume work from earlier tonight hasn't landed yet, finish or rebase onto it first; both touch `listen.js`.

---

## 1. Goal

Niles gets an email whenever a listener hits an error in the Motif player, from a subscription problem to an unknown crash, and every error is kept for 90 days so there's history to look back on.

Today there is no alert and no durable record. `api/motif-report.js` writes to the Vercel runtime log only, which on the Hobby plan is searchable for a few days at most. Several failure paths don't report at all (section 4).

## 2. Decisions already made

- **Storage:** error records live in Supabase for 90 days, then are deleted. This reverses the "nothing is stored" stance in the `motif-report.js` header. Record the decision in CLAUDE.md under "Out of scope" next to the MusicKit exception, in the same style: what's stored, why, the 90-day limit, and what must never be added.
- **Alert channel:** email via Resend. Slack may come later; keep the notify step in one function so a second channel is a small change.
- **Never stored or sent:** Apple or Spotify user IDs, tokens, email addresses, IP addresses. The pulse `listen` id may be included, because it only identifies one page load and can't link two listens.
- **Allowed:** user agent, the parsed browser/OS/device, the player's step trace (which includes song titles; acceptable here, pulse stays title-free), tape slug, position in the tape.

## 3. Error catalog

One table of stable error codes. Each entry has: `code`, `severity`, the listener-facing headline and message (what `headlineFor` and `friendly` produce today), and a one-line plain-English note for Niles that goes in the email.

Severities, which drive the email subject:

| severity | meaning | example |
|---|---|---|
| `listener` | Their account or browser, not broken | no Apple Music subscription |
| `content` | A tape problem fixable in the builder | tape not on Apple Music |
| `service` | Apple, Spotify, network, or our API | developer token mint failed |
| `bug` | Our code | uncaught exception |
| `test` | Smoke tests only | `test` |

Starting codes. Add to this list as needed; don't invent codes on the fly at call sites.

- **listener:** `apple_subscription_required`, `apple_auth_unfinished` (MusicKit `authorize()` rejected, e.g. "Unauthorized"), `premium_required`, `not_authenticated`
- **content:** `entry_not_found`, `entry_empty`, `bad_url`, `tape_not_on_apple`, `not_on_spotify`, `sides_mismatch` (the "does not sum" fallback; the listener isn't blocked, but Niles should know)
- **service:** `apple_token`, `apple_warm_failed`, `apple_playback_error` (MusicKit `mediaPlaybackError` mid-tape), `queue_failed` (`playLater` failed), `sdk_load`, `sdk_timeout`, `token_failed`, `device_lost`, `server_error` (any `api/motif-*` failure, with the endpoint name in `detail`)
- **bug:** `mid_listen` (a `guarded()` handler threw; `where` goes in `detail`), `uncaught`, `unhandled_rejection`, `unknown`

The catalog's listener copy replaces the current `friendly()`/`headlineFor()` lookups, so listener messages and reports can't drift apart. For `apple_auth_unfinished`, the message is "Apple sign-in didn't finish. Try again." Chrome-specific copy comes in a separate change.

The client needs the copy and the server needs the code-to-severity map. There's no build step, so a shared module isn't free. Pick one: a single `motif/errors.js` the page loads with a `<script>` tag and the API reads, if that works cleanly in Vercel's Node runtime; otherwise keep two lists with a comment in each pointing at the other. The server treats any code it doesn't recognize as `unknown` / `bug` and keeps the original string in `detail`. That's deliberate: the pulse endpoint has silently dropped unrecognized events three times, and this one must not.

## 4. Client: one reporting path

Replace `reportFailure` and `reportMidListen` with one `reportError(code, detail)` that every path uses. Payload:

`slug`, `code`, `detail` (short message or `where`), `listen` (pulse id), `service`, `idx`, `side`, `elapsed` (seconds since page load), `attempt` (count of reports for this code on this page), `diag` (the existing trace).

Send by beacon with the keepalive fetch fallback, as today. Keep the `pulse('fail', …)` call.

**Remove the once-per-page limit.** Each distinct failure reports. Cap repeats of the *same* code at 3 per page load so a loop can't flood the endpoint.

**Wire these paths that report nothing today:**

1. MusicKit `mediaPlaybackError` → `apple_playback_error`
2. `playLater` failure → `queue_failed`
3. Apple warm-up failure → `apple_warm_failed` (silent: the listener isn't shown anything, but Niles is told)
4. `fatal()` → `entry_not_found` / `entry_empty` / `bad_url`
5. "This tape isn't on Apple Music yet" → `tape_not_on_apple`
6. Sides fallback → `sides_mismatch`
7. `window` `error` and `unhandledrejection` listeners → `uncaught` / `unhandled_rejection`. Cross-origin errors arrive as the opaque "Script error."; report those anyway, with that as `detail`.

Map MusicKit's "Unauthorized" from `authorize()` to `apple_auth_unfinished` rather than letting it fall through to the generic message.

The MusicKit storage condition in CLAUDE.md still applies: anything rendered from a report or catalog uses `textContent`.

## 5. Server: `api/motif-report.js`

Extend it rather than adding a new endpoint. For every report:

1. **Validate.** Origin check stays. Cap field lengths, scrub tokens (existing `scrub()`), resolve the code and severity against the catalog. Still accept the old `{ slug, reason, diag }` shape for a while, because cached pages will keep sending it; map it to `unknown` with `reason` as `detail`.
2. **Log** to the Vercel runtime log as today (`[MOTIF-FAIL]`).
3. **Parse the user agent into plain words**, hand-written, no new dependency: browser (Safari, Chrome via `CriOS`, Firefox via `FxiOS`, Edge, an in-app browser such as Instagram or Facebook), OS and version, device class. "Chrome · iPhone · iOS 26.6" is the target.
4. **Store** a row in `motif_errors` (section 6) via the Supabase REST API, using `MOTIF_SUPABASE_URL` and `MOTIF_SUPABASE_SERVICE_KEY`. These already exist and point at the nilesheron project where Motif media lives; don't use the shared `SUPABASE_*` vars.
5. **Alert** (section 7).
6. **Always return 204.** A storage or email failure is logged and swallowed; it must never surface to the listener.

Put steps 3 to 5 in one helper that the server endpoints can call too. Existing helper modules here (`motif-auth.js`, `motif-tools-guard.js`) are also routes; if you follow that pattern, make the helper's default export answer 404. Alternatively, check whether Vercel skips `api/` files prefixed with `_` and use that.

**Server-side errors:** in `motif-apple-token`, `motif-token`, `motif-resolve`, `motif-save`, and `motif-upload`, any 5xx path calls the helper with `server_error`, the endpoint name, and the status. Don't change those endpoints' responses.

**Retention:** delete rows older than 90 days. Prefer a scheduled `pg_cron` job if the extension is available on the project. Otherwise run the delete from the endpoint at most once an hour (check the newest row's age, or keep a small marker row).

**Abuse caps:** the endpoint is public. Stop inserting after 500 rows in the last hour (log only), and see the email cap below.

## 6. Table

Add `supabase/motif-errors.sql`, with a header comment naming the project, like `vh-schema.sql`. Niles applies it in the SQL editor unless you have a working Supabase tool for that project.

```sql
create table motif_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null,          -- 'client' | 'server'
  slug        text,
  code        text not null,
  severity    text not null,
  detail      text,
  service     text,
  track_index int,
  side        text,
  elapsed_s   int,
  attempt     int,
  listen_id   text,
  browser     text,
  os          text,
  device      text,
  user_agent  text,
  trace       jsonb,
  alerted_at  timestamptz,
  suppressed  int not null default 0  -- repeats folded into this row's alert
);
create index motif_errors_recent on motif_errors (code, slug, created_at desc);
alter table motif_errors enable row level security;  -- no policies: service key only
```

## 7. Email

Send via Resend's HTTP API with `fetch`, no SDK. New env vars, which Niles adds in Vercel (never commit values): `RESEND_API_KEY`, `MOTIF_ALERT_TO`, and `MOTIF_ALERT_FROM` (an address on nilesheron.com, which is already verified in Resend). If any are missing, skip the email and log once; storage still happens.

**Subject:** `[Motif · <severity>] <headline> — <tape title or slug> · <browser>, <device>`
e.g. `[Motif · listener] Apple sign-in didn't finish — Red Strings · Chrome, iPhone`

**Body**, plain text: the note from the catalog; tape, side, song number, and elapsed time; service; browser, OS, device; attempt count; repeats folded in since the last email; the step trace; the row id; and a reminder that the Vercel log search term is `MOTIF-FAIL`.

**Throttle**, using the table so it works across function instances:

- One email per `code` + `slug` per 15 minutes. Later reports in that window increment `suppressed` on the row that got the email, and the next email says "N more since the last alert."
- No more than 20 emails per hour in total. When the cap is hit, send one "alerts paused for the hour, N errors stored" email and stop.
- `test` severity always sends, so smoke tests are visible, but still counts toward the hourly cap.

## 8. Out of scope

Slack, a dashboard, the Chrome sign-in fix itself, the non-Motif pages, and any change to pulse's privacy rules.

## 9. Commits and testing

Suggested commits: (1) catalog plus client reporting path; (2) table, report endpoint, storage, retention; (3) email and throttle; (4) server-endpoint wiring; (5) CLAUDE.md decision and updated header comments.

No test suite. Before each commit lands, give Niles a one-line smoke test. At minimum:

- `curl -X POST https://dev.nilesheron.com/api/motif-report -H "Origin: https://dev.nilesheron.com" -H "Content-Type: application/json" -d '{"slug":"motif-redstrings","code":"test","detail":"smoke test"}'` returns 204, a row appears, and an email arrives.
- The same curl twice within 15 minutes with a non-test code: one email, `suppressed` = 1.
- The old payload shape still stores as `unknown`.
- A deliberately bad slug on the live listen page produces `entry_not_found`.

Write a session note per CLAUDE.md when done.
