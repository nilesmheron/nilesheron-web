# Motif — Build Plan

**Repo:** `nilesmheron/nilesheron-web`  
**Live at:** `dev.nilesheron.com/motif` (and eventually `nilesheron.com/motif`)  
**Last updated:** 2026-05-28

---

## How to use this document

**At the start of each session:** read this document fully before touching code.  
**When a step is complete:** edit this file and change `[ ]` to `[COMPLETE]` for that step, then commit the update alongside (or immediately after) the code commit.  
**Do not mark a step complete until:** the change is committed, pushed, and verified live at the relevant URL.  
**If a step is blocked or changes scope:** add a note inline under that step before moving on.

---

## Reference files

| File | Purpose |
|---|---|
| `projects/motif/design_handoff_motif/styles.css` | Visual source of truth — CSS tokens, component styles |
| `projects/motif/design_handoff_motif/entry.jsx` | Interaction logic — gesture handling, card state, flip/focus/swipe |
| `projects/motif/design_handoff_motif/archive.jsx` | Archive grid logic |
| `projects/motif/design_handoff_motif/data.js` | Prototype data shape — reference only |
| `projects/motif/design_handoff_motif/README.md` | Design spec — spacing, type, tokens, interactions |
| `projects/motif/design_handoff_motif/DESIGN_DECISIONS.md` | Full token spec + deviations from base system |
| `niles-ai-management/projects/motif/architecture.md` | Architecture decisions — routing, data layer, Supabase, export |

---

## Production data shapes

### `motif/data/entries.json` — archive index

```json
[
  {
    "slug": "the-in-between",
    "no": "XI",
    "title": "The In-Between",
    "date": "Nov 2024",
    "poem_count": 5,
    "playlist_title": "the in-between",
    "current": true
  }
]
```

Ordered newest first. `current: true` on the latest entry only — drives the amber dot in the archive grid.

### `motif/data/[slug].json` — per-entry content

```json
{
  "slug": "the-in-between",
  "no": "XI",
  "title": "The In-Between",
  "date": "Nov 2024",
  "playlist_title": "the in-between",
  "spotify_url": "https://open.spotify.com/embed/playlist/...",
  "apple_music_url": "https://music.apple.com/...",
  "poems": [
    {
      "id": "lights-off",
      "title": "Lights Off",
      "date": "11.04.2024",
      "image_url": "https://[supabase]/storage/v1/object/public/motif-images/the-in-between/lights-off.jpg",
      "text": "you cannot hide\nfrom your shadow,\nunless you live\nwith the lights\noff."
    }
  ]
}
```

**Key differences from the prototype's `data.js`:**
- `lines: [string]` → `text: string` with `\n` for line breaks (split at render time on `\n`)
- `image_url` per poem — points to Supabase public bucket `motif-images`
- `playlist` object → flat `spotify_url` / `apple_music_url` / `playlist_title`
- `no` and `slug` fields added at entry level

---

## Step 1 — vercel.json rewrites

[ ] Add the following two entries to the `rewrites` array in `vercel.json`. Place them before the existing rewrite entries.

```json
{ "source": "/motif/:slug", "destination": "/motif/entry.html" },
{ "source": "/motif",       "destination": "/motif/index.html" }
```

**Rules:**
- Rewrite-only. Do not touch headers, CSP, or any other block.
- Do not change `cleanUrls` — it is already `true` and that is correct.
- Do not add a trailing slash rewrite — `trailingSlash: false` handles it.

**Verify:** after deploy, confirm `dev.nilesheron.com/motif` and `dev.nilesheron.com/motif/test-slug` return 200 (or a 404 from Vercel, not a redirect loop) before marking complete.

---

## Step 2 — CSS

[ ] Create `motif/motif.css`.

**Source:** copy `projects/motif/design_handoff_motif/styles.css` as the starting point.

**Strip these prototype-only blocks entirely:**
- `.studio`, `.studio-head`, `.studio-kicker`, `.studio-title`, `.studio-sub`
- `.stage`, `.phone-wrap`, `.phone-label`
- `.screen`
- The `@media (max-width: 860px)` block at the bottom (studio layout only)

**Modify:**
- `.motif-root`: change from `position: absolute; inset: 0` to `min-height: 100dvh; display: flex; flex-direction: column;`. Remove the `background: var(--page-bg)` line — it will be set on `body` instead.
- `html, body`: set `background: var(--page-bg)` (replace `background: #ddd9d0`).
- Hard-code `--amber-on: 0.42` in `:root` (the selected tweak value). Remove the comment about the multiplier range.
- Remove `--amber-soft` from `:root` — unused in production.

**Remove these component classes** (mock player only — not shipped):
- `.player`, `.player-art`, `.player-main`, `.player-eyebrow`, `.player-eyebrow .dot`
- `.player-track`, `.player-artist`, `.player-progress`, `.player-bar`, `.player-time`
- `.player-btn`
- `.player-logo`, `.logo-mark`

**Add:**
- `.card-img` — fills the card front face:
  ```css
  .card-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 6px;
    display: block;
  }
  ```
- `.audio-service-toggle` — for the Spotify / Apple Music switcher when both URLs are present:
  ```css
  .audio-service-toggle {
    display: flex;
    gap: 14px;
    padding: 0 22px 8px;
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .audio-service-toggle button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: var(--muted);
    transition: color 0.2s ease;
  }
  .audio-service-toggle button.active {
    color: var(--ink);
  }
  ```

**No other changes.** Every other class, token, shadow, and timing value ships as-is from the prototype.

---

## Step 3 — Logo asset

[ ] Copy `projects/motif/design_handoff_motif/mrh-logo.png` to `motif/mrh-logo.png`.

No edits to the file. The archive page masthead references it as `<img src="/motif/mrh-logo.png">`.

---

## Step 4 — Sample data files

[ ] Create `motif/data/entries.json` with one real entry using the production schema above. Use the prototype's sample entry ("The In-Between", no. XI) as the content. Set `current: true`.

[ ] Create `motif/data/the-in-between.json` using the production schema above. Use the five poems from the prototype's `data.js` (`lines` arrays → join with `\n` to produce the `text` field). For `image_url` on each poem, use a placeholder string: `"PLACEHOLDER — upload to Supabase before going live"`. For `spotify_url` and `apple_music_url`, use empty strings `""` — the entry page handles absent URLs gracefully (see Step 6).

**Do not create a Supabase bucket in this step.** That happens separately before the first real entry goes live.

---

## Step 5 — Archive page

[ ] Create `motif/index.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motif — nilesheron.com</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Caveat:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/motif/motif.css">
</head>
<body>
  <div class="motif-root archive-root" id="archive-root"></div>
  <script src="/motif/archive.js"></script>
</body>
</html>
```

[ ] Create `motif/archive.js` — vanilla JS translation of `archive.jsx`.

**Logic:**
1. Fetch `/motif/data/entries.json`
2. Render the masthead: logo, heading, lede, count line
3. Render the grid: one tile per entry, newest first
4. Each tile navigates to `/motif/[slug]` on click (`window.location.href`)
5. The `current: true` entry gets the amber live dot in `tile-no`

**Structure mirrors `archive.jsx` exactly** — same class names, same DOM hierarchy, same text content. Translate JSX elements to `document.createElement` / `innerHTML` — whichever is cleaner per block. `innerHTML` is acceptable here; there is no user-supplied content being injected.

**Masthead count line:** `${entries.length} entries · newest first`

**Verify:** `dev.nilesheron.com/motif` renders the archive grid with sample data before marking complete.

---

## Step 6 — Entry page

[ ] Create `motif/entry.html`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motif — nilesheron.com</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Caveat:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/motif/motif.css">
</head>
<body>
  <div class="motif-root" id="entry-root"></div>
  <script src="/motif/entry.js"></script>
</body>
</html>
```

[ ] Create `motif/entry.js` — vanilla JS translation of `entry.jsx`.

### Audio zone

The audio zone renders a real iframe, not the mock player. If `spotify_url` and `apple_music_url` are both present, render the service toggle above the iframe. If only one is present, render just the iframe. If neither is present, render nothing in the audio zone (it still occupies 152px of height to preserve the layout).

Spotify embed URL format: `https://open.spotify.com/embed/playlist/[id]?utm_source=generator`  
Apple Music embed URL format: use the `apple_music_url` value from the JSON directly (it should already be in embed form).

The service toggle swaps the iframe `src` attribute — no full re-render.

### Card rendering

Card front uses `<img class="card-img" src="[image_url]" alt="[title]">` inside `.face-front`. No Caveat handwriting. Keep the `.seal-dot` span. Remove the `.sig` span — it is part of the handwritten image.

Card back is identical to the prototype: `.back-top` (title + "Motif · [no]"), `.back-body` with `.typed` (text split on `\n`, each line a `<span class="ln">`), `.back-foot` (date + stamp).

### State

Plain variables — no framework:

```js
let active = poems.length - 1;  // index of frontmost card
let focused = null;              // focused card index, or null
let flipped = false;             // focused card showing its back
let touched = false;             // hides the hint after first interaction
let dragDx = 0;                  // live horizontal drag offset
```

### Card transforms

Copy the `SCATTER` table from `entry.jsx` verbatim. Copy the transform string logic for resting, active, and focused states verbatim. Apply via `card.style.transform = t`.

```js
const SCATTER = [
  { r: -8,  x: -22, y: 14  },
  { r: 6,   x: 18,  y: -8  },
  { r: -3,  x: -4,  y: 20  },
  { r: 11,  x: 26,  y: 4   },
  { r: -12, x: -30, y: -2  },
  { r: 4,   x: 9,   y: 24  },
  { r: -6,  x: -14, y: -12 },
  { r: 9,   x: 30,  y: 16  },
  { r: -10, x: -7,  y: 2   },
];
const SPREAD = 1.0;
```

### Gesture handling

**Port the `onDown` / `pointermove` / `pointerup` pattern from `entry.jsx` verbatim.** This is the most critical piece — do not deviate from the approach.

The README calls this out explicitly: attach `pointermove` + `pointerup` (and `pointercancel`) on `window` for the duration of a drag, added on `pointerdown` on the deck zone, removed on release. Resolve taps via `document.elementFromPoint`. Threshold: `|dx| > 34` and `|dx| > |dy|` = swipe; movement `< 6px` = tap; anything between is ignored.

Attach the `pointerdown` listener to `.deck-zone`.

### DOM updates after state change

Write a single `renderCards()` function that reads current state and:
1. Updates each card's `style.transform` and `style.zIndex`
2. Toggles `focused` and `flipped` classes on the correct card element
3. Toggles `is-focused` and `touched` classes on `.deck-zone`

Call `renderCards()` after every state mutation. This keeps the DOM update logic in one place.

### Entry mark (bottom-left identity)

The prototype shows a faint `motif · [slug]` mark at bottom-left of the entry page, hidden when a card is focused. Render this as `.entry-mark` inside `.motif-root` (outside `.deck-zone`).

**Verify:** `dev.nilesheron.com/motif/the-in-between` loads, cards render (with placeholder images), tap/swipe/flip all work correctly before marking complete.

---

## Step 7 — Supabase storage bucket

[ ] Create the `motif-images` bucket in Supabase as a **public** bucket (no auth required to read).

**Project:** use the Supabase project already connected to `nilesheron-web` (credentials already in Vercel env vars as `SUPABASE_URL` and `SUPABASE_ANON_KEY`).

**Path convention:** `[slug]/[filename]`  
Example: `motif-images/the-in-between/lights-off.jpg`

**Image URL pattern:**
```
[SUPABASE_URL]/storage/v1/object/public/motif-images/[slug]/[filename]
```

This URL goes directly into `image_url` in the entry JSON.

**Do not upload real images in this step** — bucket creation only.

---

## Step 8 — First real entry

This step happens when real poem images and a real playlist URL are ready. It is content work, not code work.

[ ] Upload handwritten poem images to Supabase bucket `motif-images` under `[slug]/`
[ ] Update `motif/data/the-in-between.json`: replace placeholder `image_url` values with real Supabase URLs
[ ] Update `motif/data/the-in-between.json`: add real `spotify_url` (and `apple_music_url` if available)
[ ] Verify entry page live with real images and real player embed

---

## Deferred (not part of this build)

**`api/motif-export.js` — PNG export via Puppeteer**  
On-demand serverless function. Dependencies: `puppeteer-core`, `@sparticuz/chromium`, `qrcode`. Requires user confirmation before adding runtime dependencies per `CLAUDE.md`. Note the 10-second Vercel Hobby timeout risk — flag before building.

**Apple Music toggle**  
Build Spotify-only first. Add the service toggle only when a real Apple Music URL is available to test against.

**SDK audio (v2+)**  
Spotify Web Playback SDK and MusicKit JS deferred until developer credentials are available.

**TV layout (v3+)**  
D-pad navigation, large text, no hover states. Blocked on audio iframe compatibility in TV browsers.

---

## Adding new entries (workflow)

1. Upload handwritten poem images to Supabase → `motif-images/[slug]/`
2. Create `motif/data/[slug].json` with real `image_url` values and playlist URL(s)
3. Add an entry record (newest first) to `motif/data/entries.json`; move `current: true` to the new entry
4. Commit and push — Vercel auto-deploys in ~30 seconds
5. Verify live at `dev.nilesheron.com/motif/[slug]`
