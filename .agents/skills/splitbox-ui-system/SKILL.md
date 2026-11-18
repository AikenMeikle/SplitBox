---
name: splitbox-ui-system
description: >-
  SplitBox visual design system, offline Tailwind v4 + Fontsource CSS tokens,
  radial SVG SliceMeter component, tactile crate cards, perforated GBP receipts,
  and contrast rules. MUST read before styling or building any UI component,
  page layout, badge, button, or progress indicator.
---

# SplitBox UI & Design System Skill

Use this skill whenever creating or editing CSS, layout shells, product cards, drawers, badges, or SVG progress meters for **SplitBox**. Authoritative specs: [docs/design/brand-and-ui.md](../../../docs/design/brand-and-ui.md) and [docs/product/mvp-spec.md](../../../docs/product/mvp-spec.md).

## 1. Drop-In Ready Resources (Copy Instead of Reinventing)

Start directly from the pre-built assets in `resources/`:

- **Complete Stylesheet & Tokens:** [resources/splitbox-tokens.css](./resources/splitbox-tokens.css)
  - Mirrors `src/index.css`. Includes Tailwind CSS v4 `@import "tailwindcss";`, bundled `@fontsource` imports, all `--sb-*` variables, `.sb-crate-grid-bg`, `.sb-card`, `.sb-card__receipt`, `.sb-btn`, and `.sb-badge` variants.
- **Dynamic Radial Citrus `<SliceMeter />` Component:** [resources/SliceMeter.tsx](./resources/SliceMeter.tsx)
  - Supports any `totalSlices` (`4 | 6 | 8 | 10 | 12`), renders stranger funded wedges in `#10D48E`, pops the top-right user/active slice at `translate(3, -3)` in `#FF6B1A`, and displays tabular monospace `X/Y` in the center hub.

## 2. Hard Visual & Asset Rules

1. **Zero External Font/Image/QR CDNs ([docs/design/brand-and-ui.md](../../../docs/design/brand-and-ui.md)):**
   - **NEVER** add external font links (such as Google Fonts), stock-photo URLs, or remote QR image APIs in either Demo or Live mode.
   - Use `@fontsource/space-grotesk`, `@fontsource/plus-jakarta-sans`, and `@fontsource/jetbrains-mono` via `npm` imports, `qrcode.react` (`<QRCodeSVG />`), and local SVGs in `public/assets/splitbox-*.svg`.
2. **High-Craft Light Mode & Tactile Crate Framing:**
   - Canvas is always `#F7FAF8` (`--sb-bg-canvas`), never dark mode.
   - All cards, buttons, inputs, and badges use `1.5px` or `2px solid #0B241C` borders and hard zero-blur offset shadows (`3px 3px 0px #0B241C`). Soft blurry shadows (`box-shadow: 0 10px 25px ...` or Tailwind `shadow-lg`/`shadow-md`) are **forbidden**.
3. **Strict Contrast Guardrails:**
   - On **Botanical Mint (`#10D48E`)** and **Zesty Tangerine (`#FF6B1A`)**: ALWAYS use **Deep Forest Ink (`#0B241C`)** bold text. Never put white text on mint or tangerine.
   - On **Electric Cobalt (`#1849D6`)** and **Deep Forest Ink (`#0B241C`)**: ALWAYS use **Pure White (`#FFFFFF`)** text.
4. **Numeric & GBP (`£`) Discipline:**
   - Format all currency in **GBP (`£`)** via integer pence (`£4.20`, `£0.00`), never `$`.
   - Every price, savings %, ratio (`3/4`), countdown timer, and pickup code/PIN MUST use `--sb-font-mono` (`JetBrains Mono`) with `font-variant-numeric: tabular-nums` (`.sb-mono`).
5. **Domain Vocabulary & Lifecycle Grammar ([docs/design/brand-and-ui.md](../../../docs/design/brand-and-ui.md)):**
   - Use **Box** (wholesale case), **Slice** (student share), **Box Pool** (active pool), **Slice Lock** (card pre-authorisation hold — never say `"escrow"` in live checkout UI), and **Box Drop** (campus hub pickup window):
     - *Open Pool:* `.sb-badge--cobalt` (`OPEN POOL · X/Y SLICES`)
     - *Closing Soon (1–2 Left):* `.sb-badge--tangerine` (`1 SLICE TO FILL BOX` / `2 SLICES LEFT`)
     - *User Slice Locked:* `.sb-badge--cobalt-solid` (`✓ SLICE PRE-AUTH LOCKED`)
     - *Box Filled:* `.sb-badge--mint` (`★ BOX FILLED · LOCKED`)
     - *Ready for Pickup:* `.sb-badge--mint` (`READY AT <HUB>`) + `.sb-btn--cobalt` (`Show Pickup Pass`)
6. **375px Mobile Layout Requirement:**
   - At `375px` viewport width, catalog cards MUST stack in `1fr` single-column with zero horizontal overflow (`scrollWidth <= 375`), and basket access MUST remain reachable via a sticky bottom bar.
