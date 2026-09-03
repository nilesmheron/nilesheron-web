# Motif — Blind Playlist
**Product Requirements Document**
**Version:** 0.1 (DRAFT)
**Date:** 2026-09-03
**Repo:** `nilesmheron/nilesheron-web` — `motif/`
**Status:** Awaiting review before Claude Code handoff

---

## 1. Overview

Motif today is a numbered poetry archive: each entry is a shuffled deck of cards where the front is a photo of the handwritten poem and the back is the typed text, with a companion playlist embedded in a drawer below the deck.

This expansion inverts that relationship. The playlist becomes the primary experience and the deck becomes its visual layer. A listener opens an entry link, authenticates to Spotify or Apple Music, and plays the playlist blind: no track list, no view of what's next. Each song reveals a card when it begins. Cards accumulate into a Motif deck as the playlist progresses. On completion the full deck is visible and the listener is prompted to add the playlist to their own library.

The product forces listening with curiosity. The reveal is the point.

## 2. Problem

Streaming interfaces expose the whole track list before a note plays, and skipping is one tap away. Sequenced, intentional listening (the mixtape, the album played front to back) has no home in the current interface layer. This product restores that mode without leaving the listener's own streaming service.

## 3. Users

**Curator.** Builds the playlist, pairs each song with a card, publishes the entry. In Phase 1 the only curator is Niles, authoring entries as JSON in the repo. Curator identity and branding are not a Phase 1 concern; the existing nm.h frame stays as-is.

**Listener.** Anyone with a Spotify Premium or Apple Music subscription and a mobile browser. Mobile-first is the assumed consumption context.

## 4. Phasing

**Phase 1 (this PRD).** Listener-side blind player built on the existing static-JSON entry pattern. `familiar-fruit` is the reference entry. Playback architecture proven by spike before the player is built. Curator authoring is manual JSON editing.

**Phase 2 (out of scope, sketched in §14).** Web upload and admin surface for curators. Real data store. Hardened blind (track list not readable ahead of reveal). Curator identity.

Phase 1 stays inside the repo's current posture: static HTML, no build step, serverless functions only where secrets or state require them.

## 5. Listener Experience

### 5.1 Splash

The entry link resolves to a splash page: entry cover art, entry title, and a single play button. No track count, no runtime, no track list. Tapping play initiates OAuth to the listener's streaming service (§8). On return from OAuth, playback begins.

### 5.2 Playback

The first song starts and its card is revealed. The card front is the song's album art by default. The curator can override the front and/or back with a custom asset (§6). The listener can flip the current card using the existing tap-to-flip interaction.

As each subsequent song begins, its card is revealed and joins the deck. The deck uses the existing Motif scatter layout, growing one card at a time. Previously revealed cards remain browsable (tap to focus, flip) using the current deck gestures. The listener never sees a card for a song that has not yet started.

Controls are limited to three actions: pause/resume, skip to next song, go back one song. There is no scrubber, no queue view, no track list, no shuffle. Skip reveals the next card immediately; blinding is per-reach, not per-full-listen. Going back re-focuses an already-revealed card and restarts that song.

The screen must not sleep during active playback. Audio must continue if the listener minimizes the browser (swipe away, switch apps). Browser close is not required to survive. Lock-screen and notification controls should reflect the current song where the platform allows.

### 5.3 Completion

When the last song ends, the player transitions to a completion state: the full deck is visible and browsable, and the primary call to action is "add this playlist" deep-linking to the listener's service. A secondary action allows replaying from the top. The presumption is that most listeners will add and leave rather than replay.

### 5.4 Runtime

No cap on playlist length is enforced. The 45–90 minute expectation is guidance for curation, not a system constraint.

## 6. Card Content Model

Each track in an entry has a card. Default behavior with no curator input: front is the album art fetched from the streaming service, back is song title and artist.

Curator overrides, all optional per track:

- **Custom front image.** Replaces album art. Supports the existing `fit: "cover"` crop behavior.
- **Back text.** Liner note, poem, or any short text. Rendered with the existing typed-text back layout.
- **Back image.** A photo or other non-audio visual asset in place of text.

If both back text and back image are supplied, image renders above text. If a curator supplies only a back, the front stays album art. This keeps the default entry authorable in minutes while allowing a fully curated entry to look like a Motif poetry deck.

## 7. Data Model

Extends the existing entry JSON. Existing fields (`slug`, `no`, `title`, `date`, `playlist_title`, `spotify_url`, `apple_music_url`, `poems[]`) are unchanged so the current `entry.html` experience is not affected.

New fields:

```
"cover_image_url": "...",             // splash art
"spotify_playlist_url": "...",        // public (non-embed) URL for add-to-library
"apple_playlist_url": "...",          // public (non-embed) URL for add-to-library
"tracks": [
  {
    "id": "slug-safe-id",
    "spotify_uri": "spotify:track:...",
    "apple_id": "...",
    "title": "...",                   // cached from API at authoring time; display fallback
    "artist": "...",
    "card": {
      "front_image_url": "...",       // optional override
      "fit": "cover",                 // optional, existing semantics
      "back_text": "...",             // optional
      "back_image_url": "..."         // optional
    }
  }
]
```

Track order in the array is playback order. Motif's existing per-load shuffle applies to `poems[]` only and must not apply to `tracks[]`.

A track may carry only one platform ID if the entry is single-platform. The player uses whichever ID matches the listener's authenticated service and surfaces an error state if the entry does not support that service.

Images continue to live in the existing Supabase storage bucket (`motif-images`, project `gdellbtfpcmdsfogxqwf`).

**Accepted Phase 1 limitation:** the entry JSON is a static file in a public repo. A determined listener can read the track list ahead of reveal. The blind is enforced by interface, not by access control. Phase 2 hardens this by serving tracks one at a time from an API endpoint.

## 8. Authentication and Licensing

OAuth to the listener's streaming service is required before playback starts. This is a licensing requirement, not a product choice: full-track playback of licensed music runs through the listener's own subscription. The listener's token is the playback mechanism.

Spotify requires Premium for playback control. Apple Music requires an active subscription. Free-tier Spotify listeners will authenticate successfully and then fail at playback; the player must detect this and show a clear message rather than a silent failure.

Token handling constraints, driven by `CLAUDE.md`:

- The repo is public. Client secrets and the authorization-code exchange live in serverless functions under `api/`. Nothing secret ships in static files.
- No `localStorage` or `sessionStorage`. Tokens are held in httpOnly cookies set by the `api/` callback function, scoped to `/motif`. The player calls a small `api/` endpoint to obtain a short-lived access token for the SDK rather than reading it from the browser.
- Refresh is handled server-side in the same `api/` function. The player treats token expiry as a recoverable state, not a session end.

New serverless functions (names indicative):

- `api/motif-auth.js` — initiates OAuth, handles callback, sets cookie, handles refresh.
- `api/motif-token.js` — returns a current access token for the SDK on request.

Required Vercel env vars: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and for Apple Music a developer token signing key (`APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`). Exact set confirmed in the spike.

## 9. Playback Architecture

This is the central technical decision and it is resolved by a spike, not by preference.

### 9.1 Candidate paths

**Path A — in-browser SDK.** Spotify Web Playback SDK or Apple MusicKit JS plays audio inside the page. The player holds the queue, so blinding is airtight. Spotify's SDK supports mobile browsers with documented limitations around autoplay and background play. Risk: audio may stop on iOS Safari when the browser is minimized.

**Path B — remote control of the native app.** Spotify Connect API starts playback on the listener's Spotify app one track at a time, so the native queue never learns the next song. Audio survives minimize because it is not in the browser. Risk: something has to stay awake to dispatch the next track when the current one ends, which reproduces the minimize problem from the other side. Apple Music has no equivalent remote-control API.

**Path C — native wrapper.** Out of scope for Phase 1. Violates the no-build-step posture and adds app store distribution.

### 9.2 Spike

Before any player UI is built, a throwaway page under `motif/spike/` tests Path A on both services:

1. Authenticate, start a track, confirm audio plays on iOS Safari and Android Chrome.
2. Minimize the browser. Confirm whether audio continues. Measure how long.
3. Confirm Screen Wake Lock API holds the screen on while the tab is foregrounded.
4. Confirm Media Session API surfaces title and controls on the lock screen.
5. Confirm the SDK fires a reliable track-ended event that can trigger the next play call while backgrounded.

Exit criteria: if Path A holds background audio on iOS Safari for at least one full song transition on either service, that service is the Phase 1 platform. If Path A fails on both, the spike extends to Path B for Spotify and the PRD is revised.

Platform choice for Phase 1 falls out of the spike. If both pass, Spotify is the default (larger Premium base, better-documented web API) and Apple Music is Phase 1.5.

### 9.3 Runtime dependencies

`CLAUDE.md` requires explicit direction before adding a runtime dependency. This PRD is that direction: the Spotify Web Playback SDK script and/or MusicKit JS may be loaded from their official CDNs on the player page only. They must not be added to `entry.html` or any other Motif page.

## 10. Routing

The blind player lives at `/motif/:slug/listen`. `entry.html` and the current `/motif/:slug` experience are unchanged.

**Verify first:** `vercel.json` has no rewrite for `/motif/:slug` even though `entry.js` derives the slug from the pathname. Claude Code must confirm how the existing entry route resolves before adding the `/listen` rewrite, and mirror whatever mechanism is already in use.

The OAuth callback route is `/api/motif-auth` with a `?callback` query, or a dedicated `/motif/callback` rewrite, whichever the spike finds cleaner. The redirect URI must be registered in both the Spotify and Apple developer consoles for `dev.nilesheron.com`.

## 11. Files in Scope

New:

- `motif/listen.html` — player page shell
- `motif/listen.js` — player logic: auth handshake, SDK init, blind queue, deck reveal, completion state
- `motif/listen.css` — player-specific styles, or extend `motif.css` if the delta is small
- `motif/spike/` — throwaway spike page, deleted after the decision is recorded
- `api/motif-auth.js`, `api/motif-token.js`
- `vercel.json` — new rewrite(s) only; CSP header untouched

Modified:

- `motif/data/familiar-fruit.json` — add `tracks[]`, `cover_image_url`, public playlist URLs

Reused without modification:

- Card builder, scatter layout, focus/flip gesture handling from `entry.js`. If reuse requires extraction into a shared module, that is acceptable and should be noted in the session note. Do not refactor `entry.js` behavior.

## 12. Non-Goals (Phase 1)

Curator upload or admin surface. Curator identity or branding. Both platforms at launch (one ships, the other follows). Social features, comments, discovery. Analytics beyond basic event logging. Monetization. Hardened blind (API-served track list). Desktop-optimized layout.

## 13. Success Signals

Phase 1 has no instrumentation requirement. The signals that matter, to be measured informally and instrumented in Phase 2:

- Completion rate: listeners who reach the last card.
- Add rate: completion-screen "add this playlist" taps.
- Whether the minimize-and-keep-listening behavior actually works for real listeners on real devices, which is the whole product.

## 14. Phase 2 Sketch

Not specified here; recorded so Phase 1 decisions don't foreclose it.

- Curator auth (OAuth doubles as identity) and a web authoring surface: import playlist from service, per-track card upload, publish.
- Entries move from static JSON to Supabase. The entry JSON schema in §7 is the migration target.
- Track list served one at a time from an API endpoint so the blind holds against source inspection.
- Curator branding replaces or coexists with the nm.h frame.
- Second platform if Phase 1 shipped single-platform.

## 15. Open Questions

1. What is the exact rewrite mechanism serving `/motif/:slug` today? (Verify in repo before touching routing.)
2. Does the Apple Music developer program tier Niles has access to permit MusicKit JS on a third-party domain? (Confirm before the spike.)
3. Should the completion screen offer both platforms' add links regardless of which the listener authenticated with, or only the matching one? Default: matching only.
4. Is the accumulating deck sized to the full track count (cards fanned to fit) or does it grow unbounded with the existing scatter table cycling? Default: cycle the existing nine-position scatter table, as `entry.js` already does.

## 16. Claude Code Handoff

Execution order:

1. Read `CLAUDE.md` and `DEVELOPMENT.md`. Note `DEVELOPMENT.md` predates Motif entirely; this PRD is the Motif context until `DEVELOPMENT.md` is updated.
2. Resolve Open Question 1.
3. Build and run the spike (§9.2). Record results in a session note before proceeding. Stop and report if both services fail.
4. Build `api/motif-auth.js` and `api/motif-token.js` for the winning platform. Test with `curl` per the repo testing bar.
5. Extend `familiar-fruit.json` with `tracks[]`.
6. Build `listen.html` / `listen.js`, reusing card and deck code.
7. Live-verify on iOS Safari and Android Chrome, including the minimize case.
8. Session note to `niles-ai-management/tasks/notes/nilesheron-web/`. Flag `DEVELOPMENT.md` for a Motif section as a follow-on.
