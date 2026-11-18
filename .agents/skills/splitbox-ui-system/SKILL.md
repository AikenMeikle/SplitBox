---
name: splitbox-ui-system
description: >-
  SplitBox visual design system, offline Tailwind v4 + Fontsource CSS tokens,
  radial SVG SliceMeter component, tactile crate cards, perforated GBP receipts,
  and contrast rules. MUST read before styling or building any UI component,
  page layout, badge, button, or progress indicator.
---

# SplitBox UI & Design System Skill

Use this skill whenever creating or editing CSS, layout shells, product cards, drawers, badges, or SVG progress meters for **SplitBox**. Source specs: [page-syles.md](../../../page-syles.md) and [identity.md](../../../identity.md), reconciled with [brief.md](../../../brief.md).

## 1. Drop-In Ready Resources (Copy Instead of Reinventing)

To save time during the 1-hour build, start directly from the pre-built assets in `resources/`:

- **Complete Offline Stylesheet & Tokens:** [resources/splitbox-tokens.css](./resources/splitbox-tokens.css)
  - Copy into `src/index.css`. Includes Tailwind CSS v4 `@import "tailwindcss";`, offline `@fontsource` imports, all `--sb-*` variables, `.sb-crate-grid-bg`, `.sb-card`, `.sb-card__receipt`, `.sb-btn`, and `.sb-badge` variants.
- **Dynamic Radial Citrus `<SliceMeter />` Component:** [resources/SliceMeter.tsx](./resources/SliceMeter.tsx)
  - Copy into `src/components/storefront/SliceMeter.tsx` (or `src/components/common/SliceMeter.tsx`). Supports any `totalSlices` (`4 | 6 | 8 | 10 | 12`), renders stranger funded wedges in `#10D48E`, pops the top-right user/active slice at `translate(3, -3)` in `#FF6B1A`, and displays tabular monospace `X/Y` in the center hub.

## 2. Hard Visual & Offline Rules

1. **Zero External Font/Image CDNs (`brief.md` §3.5 & §4):**
   - **NEVER** paste `<link href="https://fonts.googleapis.com/...">` into `index.html`.
   - Install `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, and `@fontsource/jetbrains-mono` via `npm install` and import them locally (already wired in `resources/splitbox-tokens.css`).
   - Load brand marks strictly from local `assets/splitbox-icon.svg` and `assets/splitbox-logo.svg` (copied to `public/assets/`).
2. **High-Craft Light Mode & Tactile Crate Framing:**
   - Canvas is always `#F7FAF8` (`--sb-bg-canvas`), never dark mode.
   - All cards, buttons, inputs, and badges use `1.5px` or `2px solid #0B241C` borders and hard zero-blur offset shadows (`3px 3px 0px #0B241C`). Soft blurry shadows (`box-shadow: 0 10px 25px ...` or Tailwind `shadow-lg`/`shadow-md`) are **forbidden**.
3. **Strict Contrast Guardrails:**
   - On **Botanical Mint (`#10D48E`)** and **Zesty Tangerine (`#FF6B1A`)**: ALWAYS use **Deep Forest Ink (`#0B241C`)** bold text. Never put white text on mint or tangerine.
   - On **Electric Cobalt (`#1849D6`)** and **Deep Forest Ink (`#0B241C`)**: ALWAYS use **Pure White (`#FFFFFF`)** text.
4. **Numeric & GBP (`£`) Discipline:**
   - Format all currency in **GBP (`£`)** (e.g., `£4.50`, `£0.00`), never `$`.
   - Every price, savings %, ratio (`3/4`), countdown timer, and pickup code/PIN MUST use `--sb-font-mono` (`JetBrains Mono`) with `font-variant-numeric: tabular-nums` (`.sb-mono`).
5. **Domain Vocabulary & Lifecycle Grammar:**
   - Use **Box** (wholesale case), **Slice** (student share), **Slice Lock** (upfront escrow hold), and **Box Drop** (campus hub pickup window).
   - Map pool states strictly to `page-syles.md` §6:
     - *Open Pool:* `.sb-badge--cobalt` (`OPEN POOL · X/Y SLICES`)
     - *Closing Soon (1–2 Left):* `.sb-badge--tangerine` (`1 SLICE TO FILL BOX` / `2 SLICES LEFT`)
     - *User Slice Locked:* `.sb-badge--cobalt-solid` (`✓ SLICE LOCKED IN ESCROW`)
     - *Box Filled:* `.sb-badge--mint` (`★ BOX FILLED · LOCKED`)
     - *Ready for Pickup:* `.sb-badge--mint` (`READY AT <HUB>`) + `.sb-btn--cobalt` (`Show Pickup Pass`)
6. **375px Mobile Layout Requirement:**
   - At `375px` viewport width, catalog cards MUST stack in `1fr` single-column with zero horizontal overflow (`overflow-x: hidden` safe), and basket access MUST remain reachable via a sticky bottom bar.
