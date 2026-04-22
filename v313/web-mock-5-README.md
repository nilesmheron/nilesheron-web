# Handoff: Venture 313 Homepage — v5a.2 (Photo-Forward Refined)

## Overview

This is the v5a.2 homepage design for **Venture 313**, a 3-year, $10M capital initiative for Detroit founders backed by the Gilbert Family Foundation and run in partnership with TechTown Detroit, Invest Detroit Ventures (IDV), and Detroit Development Fund (DDF).

The direction continues from `v313/web-mock-4.html` (commit `e3e9fcb`) — event-forward, analytics/data-viz aesthetic, Space Grotesk display, reduced purple usage (reserved for GFF-branded contexts). v5a.2 extends that direction with substantially more photography real estate to accommodate the project's archive of full-bleed and hi-res imagery.

## About the Design Files

The bundled file `v5a-v2.html` is a **design reference created in HTML** — a static prototype showing the intended look, layout, and content rhythm of the homepage. **It is not production code to copy directly.**

The task is to **recreate this design inside the target codebase's existing environment** (React/Next.js is the assumed path given the repo structure; Vue/Astro/etc. fine if that's what's established) using the project's own patterns, component primitives, and image pipeline. If no framework is yet established, Next.js 14+ with the App Router is a natural fit given the static/editorial character of the page.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and layout are intended to be implemented pixel-for-pixel. Photography is represented by striped monospace-labeled placeholders — swap these for real imagery using the project's image pipeline (e.g. `next/image`). Caption text inside placeholders (e.g. `IMG · 01 · MICHIGAN CENTRAL · SPRING INTENSIVE · 2026`) is a brief for what photo belongs in that slot, not copy to render.

## Design Tokens

### Colors

```css
--v-black:       #0A0A0A   /* body bg, primary dark surface */
--v-carbon:      #141414   /* raised card surface on dark */
--v-graphite:    #2A2A28   /* hairlines, dividers, card strokes on dark */
--v-ash:         #3A3A38   /* secondary strokes */
--v-smoke:       #8A8A88   /* muted mono labels on dark */
--v-fog:         #B8B6AE   /* body text on dark, muted paper text */
--v-paper:       #F5F3ED   /* primary text on dark; light section bg */
--v-paper-2:     #EDEBE3   /* alt light bg (GFF callout) */

--v-green:       #C5F74E   /* PRIMARY ACCENT — live dots, CTAs, data-viz 01 */
--v-mint:        #56EB91   /* data-viz 02 (equity) */
--v-teal:        #11A78A   /* data-viz 03 (debt) */

--v-purple:      #C4B5FD   /* GFF highlight fill only */
--v-purple-deep: #2A1B6B   /* GFF eyebrow/attribution only */
```

**Accent rule:** Green is the primary accent everywhere. Purple appears **only** on GFF-branded contexts (the founding partner chip, GFF pullquote highlight, and light section eyebrows that credit GFF indirectly). Do not use purple on interior pages except in GFF-tagged moments.

### Typography

| Role | Family | Weights |
|---|---|---|
| Display (headlines, section titles, big numbers) | **Space Grotesk** | 400 / 500 / 600 / 700 |
| Body | **Inter** | 400 / 500 / 600 |
| Mono (eyebrows, labels, metadata, ticker, stats) | **JetBrains Mono** | 400 / 500 |

Expose the display font as a CSS variable (`--display-font`) so it can be swapped; currently only Space Grotesk is shipped but design explored Archivo, DM Sans, IBM Plex, Archivo Narrow as alternates.

**Type scale (desktop):**
- H1 hero: `clamp(44px, 5.4vw, 72px)` / weight 500 / tracking −0.025em / line-height 0.98
- H2 section: 38px / weight 500 / tracking −0.02em
- H2 community band: `clamp(36px, 4.5vw, 58px)` / weight 500 / tracking −0.025em
- H2 CTA: `clamp(34px, 4vw, 54px)` / weight 500 / tracking −0.025em
- H3 featured event title: 26px / weight 500
- Big stats (impact numbers): 56px / weight 500 / tracking −0.03em
- Body: 15–16px / line-height 1.55–1.65
- Mono eyebrow: 11px / letter-spacing 0.18em / weight 500 / UPPERCASE
- Mono label (small): 10px / letter-spacing 0.2em / weight 500 / UPPERCASE

### Spacing

Container: `max-width: 1440px; margin: 0 auto;`

Section padding: `96px 40px` (primary); `80px 40px` (events); `88px 40px` (impact); `48px 40px 32px` (footer). Gutters of `20px` or `32px` inside grids.

Breakpoint: 900px (mobile collapses all grids to 1fr).

### Strokes & borders

All divider lines are **0.5px** (half-pixel) on dark backgrounds in `--v-graphite`, 0.5px `rgba(0,0,0,0.1)` on paper. No rounded corners except: CTA buttons (3px), live-dot pulse (50%), speaker avatars (50%). Cards have sharp 90° corners.

### Live-dot pulse (signature element)

```css
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(197,247,78,0.7); }
  70%  { box-shadow: 0 0 0 6px rgba(197,247,78,0); }
  100% { box-shadow: 0 0 0 0 rgba(197,247,78,0); }
}
.live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--v-green);
  animation: pulse 2s ease-in-out infinite;
}
```

Used in: hero eyebrow, ticker marquee, featured-event tag, schedule sub-ticker.

### Corner ticks (decorative, on featured surfaces)

14×16px L-shaped corners in `--v-green` at 60–70% opacity, placed top-left and bottom-right of featured event card and all `.photo-immersive` blocks. See `::before / ::after` on `.featured-event` and `.photo-corner-tl / .photo-corner-br`.

---

## Screens / Sections

The homepage is a single scrolling page composed of 11 sections, top to bottom. See v5a-v2.html for implementation details — this README captures the design system and intent.

Section order:

1. **Ticker** (marquee) — auto-scrolling news/status feed
2. **Nav** — sticky, blurred backdrop
3. **Hero** — full-bleed photo + headline + deploy meter ($5.5M / $10M · 55%)
4. **Events grid** (inside hero) — featured event card (with venue photo column) + upcoming schedule
5. **Impact** — 4 big stats + stacked capital-flow chart (grant/equity/debt)
6. **Portrait strip** (full-bleed 6-col row) — founder portrait gallery
7. **Founders** — 2-up editorial cards with pullquotes + stats
8. **About** — $10M commitment / three partners / continuum-mini
9. **GFF callout** (paper-2 bg, purple-reserved context) — Laura Grannemann pullquote
10. **News grid** — 3-col cards with thumbnails
11. **Community band** (full-bleed photo) — "Built by founders. Backed by Detroit." + 116 stat
12. **CTA** — green band with application prompt
13. **Footer** — partners + attribution

---

## Interactions & Behavior

- **Ticker**: pure CSS `@keyframes tick` 60s linear infinite; items duplicated in DOM so the seamless loop works. In production, render as a single `<ul>` repeated twice server-side.
- **Live-dot**: pure CSS `@keyframes pulse`.
- **Nav**: sticky, blur backdrop. Active state driven by current route.
- **Hover states**:
  - `.founder-card` + `.news-card`: `translateY(-2px)` + soft shadow, 0.2s transition
  - `.schedule-row`: bg `rgba(197,247,78,0.02)` on hover
  - `.stacked-seg`: `filter: brightness(1.1)` on hover
  - Nav links: color → `--v-green`, 0.15s
- **Link arrows** (`→`): always trailing, never leading. Green mono on dark; black mono on light.
- **Responsive**: single breakpoint at 900px. All multi-col grids collapse to 1fr. Nav links hide (add burger in production). Stacked bar stacks vertically. Portrait strip → 2-col. Footer partners wrap.

No JS behavior required for the homepage itself except the ticker (CSS only) and any future CMS hydration.

---

## State Management

Homepage is largely static. For production consider these data sources:

- `upcomingEvents[]` — feeds featured card + schedule list + ticker `LIVE` items
- `deployMeter { deployed, commitment, percent, durationMonths }` — hero meter
- `impactYearToDate { deployed, founders, followOn, jobs, deltaVsPrevYear, returnMultiple }` — stats + ticker
- `capitalFlow[]` — 3 rows for stacked bar + legend
- `featuredFounders[]` — portrait strip + founder cards (different subsets)
- `pressItems[]` — news grid
- `partnerQuote` — GFF callout attribution + quote
- `portraitStripImages[]` — 6 images with alt/caption

---

## Assets

All imagery in the prototype is **striped monospace-labeled placeholders** (cream stripes on paper bg, dark textured stripes on immersive bg). Each placeholder carries a `data-ph` attribute with what photo belongs there — treat these as art direction briefs:

- `IMG · 01 · MICHIGAN CENTRAL · SPRING INTENSIVE · 2026` — hero bg
- `VENUE · MICHIGAN CENTRAL` — featured event venue column
- 6 founder portraits for portrait strip
- 2 founder portraits for founder cards (Crystal Brown, Darren Riley currently)
- 3 editorial thumbs for news cards
- `IMG · 02 · V313 DEMO DAY · MICHIGAN CENTRAL · 2025` — community band
- Optional photographic layer for CTA `IMG · 03`

All imagery should come from the project's existing archive of V313 photography. Use the project's image pipeline (`next/image` or equivalent) with appropriate `sizes` and priority hints (hero = priority; below-fold = lazy).

## Implementation notes

- The prototype uses inline `<style>`; production should split into either a global tokens file + component-scoped styles (CSS Modules / Tailwind config / vanilla-extract / whatever the codebase uses).
- **Tokens come first.** Before building components, land all design tokens (colors, type scale, spacing, stroke widths) in the codebase's config so interior pages inherit them automatically. This file is the single-page expression — the system should outlive it.
- Accessibility: all live-dots are decorative (mark `aria-hidden`); the ticker should have `aria-label="News ticker"` on the container; the stacked bar should carry `role="img" aria-label="Capital deployment by vehicle"` (already set).
- Reduce motion: wrap the ticker `animation` and pulse `animation` in `@media (prefers-reduced-motion: reduce) { animation: none; }`.
- The `.photo-immersive` decorative gradients should degrade gracefully behind real `<img>` elements; real photography should sit **under** the scrim gradient, **above** the bg texture.
