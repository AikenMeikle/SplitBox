---
name: splitbox-qa-gate
description: >-
  Fast automated asset-CDN & GBP currency verification, TypeScript + Vite build
  gate, Dual-Mode (Demo vs Live Supabase/Stripe) verification rules, and SplitBox
  acceptance checklist. MUST read and run before completing integration or QA.
---

# SplitBox QA & Acceptance Gate Skill

Use this skill in the integration/QA phase (or after editing components) to guarantee all acceptance gates in [docs/product/mvp-spec.md](../../../docs/product/mvp-spec.md) and visual rules in [docs/design/brand-and-ui.md](../../../docs/design/brand-and-ui.md) pass cleanly.

## 1. Run Automated Verification Script First

Execute [scripts/verify_offline_and_build.sh](./scripts/verify_offline_and_build.sh) from the workspace root:

```bash
bash .agents/skills/splitbox-qa-gate/scripts/verify_offline_and_build.sh
```

What this script checks automatically:
1. **Zero Forbidden External Runtime Asset URLs:** Scans `index.html` and `src/` for hardcoded external `https://` or `http://` links (blocking Google Fonts links, Unsplash/Pexels stock URLs, and external QR image APIs while ignoring standard `w3.org` SVG XML namespaces and `localhost`).
2. **GBP (`£`) Currency Hygiene:** Scans `src/` for stray USD `$` price literals (e.g., `$6.90`).
3. **Local Brand Assets:** Confirms `public/assets/splitbox-icon.svg` (or `src/assets/splitbox-icon.svg`) exists locally so navbar and pass marks never 404.
4. **Clean Production Build:** Runs `npm run build` (`tsc -b && vite build`) and fails on any TypeScript or bundler error.

### Dual-Mode Verification (`VITE_DEMO_MODE` vs Live Supabase / Stripe)
- **Current Build & Demo Mode (`VITE_DEMO_MODE=true` or no `.env` keys):** `verify_offline_and_build.sh` passes out-of-the-box with zero external URLs in `index.html` / `src/`, and `npm run dev` boots completely offline with `0` non-localhost network requests.
- **Live Production Mode (`Supabase` + `Stripe` + `Resend`):**
  - Inject runtime endpoints via environment variables (`import.meta.env.VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`) rather than hardcoding `https://` URLs in `src/`.
  - If official SDK endpoints (`*.supabase.co`, `js.stripe.com`, `api.stripe.com`) are referenced in Live adapter modules, only allowlist `\.supabase\.co|js\.stripe\.com|api\.stripe\.com` in `verify_offline_and_build.sh`'s `grep -Ev` filter—external font, image, and QR CDNs remain **strictly forbidden** in both modes, and `VITE_DEMO_MODE=true` must continue to pass with `0` external runtime requests.

## 2. 60-Second Functional & Visual Audit Checklist

Verify each gate in code (and on `localhost` via `npm run dev`):

- [ ] **Gate #1 — Storefront & UoB Drop Rules:** App boots cleanly in Demo Mode without a login wall (and enforces `@student.bham.ac.uk` Magic Link in Live Mode), displays UoB hub selector (`Vale · Shackleton` launch hub), countdown, category + *"Almost Full (1–2 Left)"* filters, and sealed UK FIR-compliant ambient items in `£` with `<SliceMeter />` radial SVG dials and dashed wholesale receipt blocks.
- [ ] **Gate #2 — Sequential Case-Boundary Split (`3/4 + 2` Test):** Ordering `2` slices of an item at `3/4` assigns Slice 1 to `Box #1 (4/4 Locked)` and Slice 2 to `Box #2 (1/4 Pooling)` (persisting across reloads via `localStorage` in Demo Mode or Postgres `SELECT ... FOR UPDATE` in Live Mode).
- [ ] **Gate #3 — Cutoff Settlement & Partial Auto-Release:** Full `100%` boxes transition to *Fulfilled* while `<100%` overflow slices transition to *Auto-Refunded / Released* (`£0.00` captured on unfulfilled slices without cancelling fulfilled items in the same order), rendering a local `<QRCodeSVG />` + **4-digit PIN** when `fulfilledSliceCount > 0`.
- [ ] **Gate #4 — `375px` Mobile Layout:** At `375px` width, `.sb-catalog-grid` stacks in `1` column with zero horizontal overflow (`scrollWidth <= 375`), and the sticky bottom bar opens the Basket Drawer cleanly.
- [ ] **Gate #5 — Contrast & Tactile Crate Craft:** `#0B241C` ink text on `#10D48E` mint and `#FF6B1A` tangerine (`#FFFFFF` text only on `#1849D6` cobalt and `#0B241C` ink); hard `1.5px–2px solid #0B241C` borders + zero-blur offset crate shadows (`3px 3px 0px #0B241C`).
