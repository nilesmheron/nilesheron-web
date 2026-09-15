# Memorex — notes for the next version

**Status:** collecting. Not a spec yet.
**Date opened:** 2026-09-15
**Supersedes in progress:** `2026-09-03-motif-blind-playlist-prd.md` is v0.1 DRAFT and wrong in roughly six places. These notes are the seed of a v0.2 rather than patches to it.

Functionality notes from Niles, recorded as given, with implications flagged. Nothing here is decided unless it says so.

---

## 1. Private / hidden mixtapes, native in the builder

**Partly shipped already, 2026-09-14.** `unlisted: true` exists: a checkbox in builder step 1, honoured by `rebuildManifest()` in `api/motif-save.js`, validated server-side.

**But "unlisted" and "private" are different things and only one is built.**

| | Built? | Means |
|---|---|---|
| **Unlisted** | yes | Kept off `/motif/mixtape`. Anyone with the link plays it. The link is the secret. |
| **Private** | no | Getting in requires something — a passphrase, or being on a list. |

**Open question for Niles.** If unlisted is what you meant, this is done. If you meant private, it is new surface: a gate on a listener-facing page, which the product has never had. The curator tools are Basic-Auth gated, but that is a tool, not a listener experience, and a password prompt in front of a mixtape is a very different feeling from a link someone sent you.

If private is wanted, the cheapest version that keeps the feeling is a passphrase in the URL (`/motif/<slug>/listen?k=…`) checked server-side before the entry JSON is served. Worth noting the entry JSON is a static file in a public repo today, so real privacy means moving that one file behind a function.

---

## 2. The builder should match the listener experience

Thematically, at least. Today the builder is the warm-paper Motif system while the player is becoming the Tape direction; after the redesign lands they will not look like the same product.

**Agreed in principle.** One caution worth designing around rather than ignoring: the player is deliberately sparse because it is a thing you operate with one hand while the screen is mostly off. The builder is dense on purpose — candidate lists, per-track card editors, previews — because it is a workbench. Matching *tokens, type and mood* is right; matching *layout and density* would make the builder worse.

Read it as: the builder should feel like the same object's other side. The deck of a tape machine rather than the tape.

Should go to Claude Design in the same stream as splash / completion / index, after those land.

---

## 3. Side A and Side B

**The design already assumes this.** The tape-player handoff writes `of 18 · side A` in the transport counter and `Side A · 06` on the liner note — both hardcoded, because nothing in the data model backs them yet. The visual language exists and is waiting for the structure.

**Minimum version, wanted now:** the player shows which side is playing.

**What it needs:**

- **Data.** A side per track, or a single index where B begins. Per-track is more flexible (a curator could reorder freely); a split index is simpler and cannot produce an invalid state like `A,B,A`. Leaning split index.
- **Builder.** A divider the curator drags or sets, so the split is visible while sequencing rather than a number typed into a field.
- **Disclosure — a real decision, not a detail.** Showing "6 of 9 · Side A" tells the listener a boundary is coming. That is new information the blind does not currently give. It is still not *song* information, so the core rule holds, but it changes the shape of what a listener knows.

  Niles's framing is that this is the point: sides create **thematic adjacency without continuation** — permission for side B to be a different mood rather than more of side A. Recorded as intentional, and it should be an explicit line in v0.2 rather than something a future reader has to infer.
- **Splash — DECIDED 2026-09-15, and shipped.** The primary button reads **"Play side A"** on a two-sided tape.

  This resolves the disclosure question in the best available way. It tells the listener a side B exists and nothing else — no songs, no boundary position, no runtimes — so the blind is untouched, and it *pre-frames the flip*. Someone who pressed "play side A" has already been told the tape has sides; someone who pressed "play" and then had the music stop in their pocket has met a bug. The cost of the flip reading as a defect the first time, which Niles had accepted, is largely paid off by one word on one button.

  The service name moves off the button and onto the line above it, which already says "Plays through your own Apple Music." That line is load-bearing — it exists because a real listener failed for want of it — so it stays.

  Still open: whether `18 songs · about 1h 2m` should become per-side (`9 + 9`). Leaving the total for now; "Play side A" already carries the structural disclosure, and splitting the count adds a second one for less benefit.

  **Also open: can a listener start on side B?** A real cassette lets you put in either side. The current answer is no — side B is reached only by flipping — which preserves the sequence the curator built. Worth a deliberate decision rather than a default.

---

## 4. "Flip the tape" — deferred, but cheaper than it looks

A deliberate stop at the end of side A, prompting the listener to flip before side B continues.

**Deferred by Niles.** Recording one technical finding now so it is not rediscovered later.

This looks like it fights the architecture and does not. The whole player is built so that automatic transitions survive a locked screen, and rule 3 exists because **iOS refuses to start a new media source without a user activation** — a tap. A flip prompt is a deliberate stop that requires a tap to resume.

So the platform constraint and the product moment want the same thing. Implementing the flip means *not* queueing across the boundary and waiting for a press, which is the one case where the thing that has caused the most trouble in this project is exactly what the feature needs. No new mechanism, no fight with the queue.

The cost is honest and worth stating: the tape stops in the listener's pocket and does not restart until they take the phone out. That is the feature, but it will read as a bug to anyone who has not been told, so the prompt has to be unmistakable on the lock screen as well as in the page.

---

---

## 5. Cassette length — C60 / C90 / C120 (future)

Niles, 2026-09-15: eventually force the builder to pick a cassette length and hold each side to half of it.

This turns the side break from a curator preference into a **constraint**, which is the more interesting version — a real tape tells you when you have run out of room, and that shapes the sequencing rather than describing it. A C90 gives 45 minutes a side; the 18-track tape at 61:46 is a C60 with about a minute to spare per side, or a comfortable C90.

Implications when built:
- The builder stops being "arrange songs, then split" and becomes "fill side A, then fill side B", with remaining room shown as you go.
- Over-running a side becomes an error the curator must resolve, not a warning.
- It may constrain track *choice*, not just order — a five-minute song that does not fit is a real editorial decision, which is the point.
- The current `side_b_starts_at` model still works; the length is an additional field (`cassette: 'C60' | 'C90' | 'C120'`) that drives validation rather than structure.

Not started. Recorded so the shape of the current split does not foreclose it — it does not.

---

## 6. Curator attribution — mixtapes by someone (future)

Niles, 2026-09-15: long term, other people build their own mixtapes. "A mixtape by Niles", "a mixtape by Nick", each with their own box of tapes, regardless of whether individual tapes are public or unlisted.

**Worth specifying before it is needed**, because it reaches further than it looks:

- **Entry gains an author.** `curator: { handle, name }` or similar. Cheap now, expensive to retrofit across saved entries later.
- **The index becomes plural.** `/motif/mixtape` is currently one global shelf. Attribution implies per-curator shelves — `/motif/by/<handle>` — and a decision about whether the global shelf survives alongside them.
- **The builder gains identity.** Today it is one Basic Auth gate for one person. Per-curator means real accounts, which is the first genuine authentication in this product. `MOTIF_TOOLS_USER` does not extend to this.
- **Writes need scoping.** `api/motif-save.js` commits to a fixed repo path with a single token. A second curator must not be able to overwrite the first's tapes.
- **Unlisted stays orthogonal.** A curator's box lists their tapes; unlisted ones stay out of every shelf, including their own, and remain reachable by link. Niles confirmed this reading.
- **Attribution is also a display decision** — "a mixtape by" belongs in the splash and the index, which are being designed right now. Worth mentioning to Claude Design in the current round even though the backing does not exist, so the layout has a place for it later.

The minimum that avoids a painful migration: **add `curator` to the entry schema now**, defaulted to Niles, even while nothing reads it.

---

## Open questions for Niles

1. ~~Unlisted or private?~~ — **answered 2026-09-15: unlisted.** Shipped.
2. **Does the splash state the A/B split**, or is the first side boundary a surprise? (§3)
3. ~~Per-track side, or a split index?~~ — **built as a split index** (`side_b_starts_at`), 2026-09-15.
4. **Should `curator` go into the schema now** as a defaulted field, ahead of anything reading it? (§6)
