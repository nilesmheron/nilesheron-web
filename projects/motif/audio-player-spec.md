# Motif — Audio Player Spec

_Status: draft for review · 2026-05-29 · supersedes the audio handling in `motif-build-plan.md`_

## Why this exists

The entry page pairs each Motif with a playlist. Today that's two embed iframes
(Apple Music / Spotify) with a toggle. Feedback raised three things:

1. **Apple Music should be the default**, not Spotify. _(shipped)_
2. **The iframe needs more vertical room.** _(shipped — 100→175px)_
3. **"Once you play you can't stop it, or control it."** Partly the clipped
   control bar (fixed by the taller iframe), partly a deeper wish for real
   transport control — hence _"might need to go SDK sooner than later."_

This spec is mostly about #3: what "control" can actually mean here, and whether
an SDK is the right move.

## The constraint that drives everything

The playlists are **third-party commercial tracks** (e.g. the screenshot shows
Tobe Nwigwe — "FYE FYE"). That single fact rules things in and out:

- We **cannot self-host** the audio — no rights to those recordings.
- Embed iframes are a **cross-origin black box**: the page cannot read or drive
  what's inside them. No custom play/pause, no scrub, no sync-to-card-flip.
- For non–logged-in visitors, both services play **previews only** (~30s
  Spotify / ~30–90s Apple). Full tracks require the visitor to be signed into a
  paid account **in that browser**.

So the tension is a triangle — pick two:

```
        full tracks
           /  \
          /    \
   no login --- custom control
```

You can't have all three with licensed third-party music. Embeds give
"full-tracks-for-subscribers + no-login-previews" but no custom control. SDKs
add custom control but force a paid login. Self-hosting would give no-login +
full control but is off the table on rights.

## Options

### A. Polish the embeds — _recommended_
Keep the two iframes; make them as good as embeds get.
- Apple default _(done)_, taller iframe _(done)_, switching services stops the
  other _(already true — changing `src` tears down the old player)_.
- Possible follow-ups: a sticky/collapsible mini-player; remember last-used
  service; lazy-load the iframe until first interaction (perf).
- **Cost:** ~0. **Risk:** none. **Ceiling:** no custom transport; previews for
  non-subscribers. The native in-iframe controls (play/pause/scrub) work fine
  once given room — which #2 just fixed.

### B. Spotify Web Playback SDK
Programmatic control + a custom UI we build.
- **Requires:** visitor signs in with Spotify **Premium**; OAuth + a token
  endpoint (this repo's `api/` could host it). Free users **cannot** use the
  Web Playback SDK at all.
- **For a public poetry archive this is the wrong trade** — it puts the music
  behind a Premium login wall for most visitors.
- **Cost:** high (auth, token refresh, backend, player UI, error states).

### C. Apple MusicKit JS
Programmatic control + custom UI.
- **Requires:** Apple Developer membership ($99/yr) to mint a developer JWT;
  visitors authorize with an Apple Music subscription for full playback
  (previews otherwise).
- Same audience problem as B, plus paid developer infra.
- **Cost:** high.

### D. Self-host audio — _not viable here_
Full control, no login, full tracks for everyone — but only for **owned or
licensed** audio. Off the table for third-party commercial tracks. Worth
remembering only if a future Motif uses Niles'/VH-owned recordings.

## Recommendation

Stay on **Option A.** The two shipped fixes (Apple default, taller iframe)
resolve the concrete complaints — the native transport is usable now. Going SDK
(B/C) wouldn't give "control for everyone"; it would gate the music behind a
paid login, which contradicts a public, frictionless art piece. SDK only makes
sense if the goal explicitly shifts to "a logged-in, subscriber-only listening
experience."

## Open questions (need Niles' call before any SDK work)

1. **Is requiring a Spotify/Apple login acceptable?** If music must "just play"
   for any visitor, B and C are out and we stay on embeds.
2. **What does "control" mean to you** — a working pause/scrub (embeds do this
   with the new height), or a *custom unified transport* (one play/pause for
   either service, possibly synced to card flips)? Only the latter needs an SDK.
3. **Will any future Motif use owned/licensed audio?** If yes, Option D becomes
   the path to full control with no login — worth designing the data model to
   allow a self-hosted `audio_url` alongside the embed URLs.

## Shipped this session (in the current build)

- Apple Music is the default service (listed first, loaded first); Spotify is
  the secondary toggle. — `motif/entry.js`
- Audio iframe 100→175px, `.audio-zone` 152→232px, so the embed's native
  play/pause/scrub isn't clipped. — `motif/entry.js`, `motif/motif.css`

## If we later build a custom transport (sketch, not committed)

- Add `audio_url` (self-hosted) to the poem/entry schema; when present, render a
  native `<audio>` + custom controls instead of an embed.
- For SDK routes, add a token endpoint under `api/` (coordinate per CLAUDE.md —
  `api/` is shared) and an auth gate; keep embeds as the no-login fallback.
