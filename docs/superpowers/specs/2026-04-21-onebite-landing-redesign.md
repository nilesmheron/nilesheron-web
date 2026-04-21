# OneBite Landing Page Redesign

**Date:** 2026-04-21
**File:** `sandbox/personal-ai-os/index.html` (landing section only)
**Audience:** Warm referrals — someone sent them here, they arrive with trust and curiosity

---

## Overview

Replace the current text-heavy landing page (brochure for skeptics) with an atmospheric, experience-first page that earns its name. The hero leads with the elephant metaphor, the illustration does visual work, and below the fold two columns orient and prove without over-explaining.

All existing JS behavior is preserved — `startChat()`, progress bar, chat view, assessment view. Only the landing section HTML and CSS changes.

---

## Design Tokens

Inherits the existing Notebook Light system already in `index.html`:

```
--bg: #F4F1EB          cream paper
--bg-alt: #FAF8F3      lighter surface
--text: #2B2824        warm dark ink
--text-muted: #6B635A  secondary text
--text-dim: #8B8378    labels, fine print
--accent: #CC785C      Claude orange
--accent-ink: #FAF8F3  text on accent
--border: #D4CFC4      hairline
```

Fonts: Fraunces (serif, display + body) · Inter (UI, labels, fine print) — already loaded.

---

## Asset

**Elephant illustration:** Crop from the provided mockup image (`image-cache/.../5.png`). Save as `sandbox/personal-ai-os/elephant.png`. Crop region: upper-right quadrant, the pencil-sketch elephant on the cream background. Strip to transparent or leave on white — whichever looks cleaner against `--bg`.

The elephant is a warm pencil-sketch style cartoon elephant (smiling, front-facing). It carries the brand metaphor visually. No other images needed.

---

## Page Structure

### Header (unchanged)
```
[OneBite wordmark]                    [A free tool]
─────────────────────────────────────────────────── (1px --border)
```

### Hero Section

Two-column flex layout. Max-width 780px, centered. Padding 4rem top, 3.5rem bottom.

**Left column (copy):**

1. Eyebrow — Fraunces italic, 16px, `--text-muted`:
   > *Figuring out how to use AI can feel like trying to eat an elephant.*

2. Headline — Fraunces 500, 38px, line-height 1.15, `--text`:
   > But there's only one way to do it.
   > **OneBite at a time.**
   > ("OneBite at a time." in `--accent`)

3. Sub — Inter 15px, `--text-muted`, max-width ~380px:
   > A 10-minute conversation. A personalized plan for how AI can actually fit into your work.

4. CTA button — accent orange, Inter 500 15px, border-radius 10px, padding 13px 28px:
   > Get my assessment →

5. Fine print — Inter 12px, `--text-dim`, two lines stacked:
   > Takes about 10 minutes. Your conversation isn't stored by default.
   > No elephants will ever be harmed in the making of this product.

**Right column (illustration):**
- `<img src="elephant.png" alt="A friendly elephant">`, width ~220px
- `align-self: center`
- No border, no shadow, natural bleed into `--bg`

---

### Divider
1px `--border`, max-width 780px, centered.

---

### Below Fold

Two-column flex layout. Max-width 780px, centered. Padding 3rem top and bottom. Gap 3rem.

**Left column — How it works:**

Label: Inter 11px, uppercase, `--text-dim`, letter-spacing 0.14em: `HOW IT WORKS`

Step 1 (circle number + text):
> **A short conversation.** OneBite asks about your work, your tools, and what's getting in the way.

Step 2 (circle number + text):
> **A real assessment.** Specific tools, a first move, and a step-by-step setup guide built for your situation.

Closing beat — separated by a 1px `--border` top, Fraunces italic 15px, `--accent`:
> *One bite at a time.*

**Right column — Example output card:**

Card: `--bg-alt` background, 1px `--border`, border-radius 12px, width ~300px.

Card header: `ONEBITE ASSESSMENT` label (left) · `Mia` name (right)

Card body — two sections:
- `WHAT WE HEARD` → *"You're running three projects out of your inbox and a Notion board nobody updates. The synthesis is all in your head..."*
- `YOUR FIRST MOVE` → *"Set up a Claude Project this week. Load it with your last 5 client notes and use this starter prompt..."*

Section text: Fraunces 13px, `--text-muted`, line-height 1.6.

Card footer (border-top):
- Full-width orange CTA button: `Get my assessment →`
- Fine print centered below: `Free. Takes 10 minutes.`

The card CTA also calls `startChat()`.

---

## Removed from Current Landing

These elements are deleted entirely:

- Long explanatory paragraphs ("Sometimes AI can be scary..." / "This tool isn't owned by a company...")
- "A free tool" eyebrow inside the hero body
- 3-step "How it works" accordion (replaced by 2-step inline list)
- Expand/collapse example card with toggle button
- `.land-section-label`, `.example-toggle`, `.example-more` elements and their CSS

---

## Responsive Behavior

- Below 640px: hero and below-fold columns stack vertically; elephant illustration moves above the copy or scales to ~140px; example card goes full-width below the steps
- Progress bar in header stays right-aligned on all sizes

---

## Implementation Notes

- Crop elephant from `image-cache/.../5.png` using Python/PIL before referencing in HTML
- Add `sandbox/personal-ai-os/elephant.png` to repo
- Replace only the `#landing` div contents and associated CSS in `index.html`
- `startChat()` is called by both the hero CTA and the card CTA — wire both
- Add `.superpowers/` to `.gitignore` if not already present
